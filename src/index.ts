import debug from 'debug'
import { config } from 'dotenv'
import { LRUCache } from 'lru-cache'
import {
  EMPTY,
  Observable,
  Subject,
  fromEvent,
  lastValueFrom,
  map,
  mergeMap,
  of,
  share,
} from 'rxjs'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'

import { ServerWebsocketApi, messagesToString } from './lib/api'
import { Asyncify, IpcResponse } from './lib/ws-rpc'
import { createRemoteClient } from './lib/ws-rpc-client'

// Define webhook launch options interface
interface WebhookConfig {
  domain: string
  path?: string
  port?: number
  secretToken?: string
}

interface LaunchOptions {
  webhook: WebhookConfig
}

// Load environment variables
config()

const d = debug('b:telegram')

// Environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const BEATRIX_WS_URL = process.env.BEATRIX_WS_URL
const CONVERSATION_TIMEOUT_MS = parseInt(
  process.env.CONVERSATION_TIMEOUT_MS || '300000',
  10
)

// Webhook configuration
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN
const WEBHOOK_PORT = process.env.WEBHOOK_PORT
  ? parseInt(process.env.WEBHOOK_PORT, 10)
  : undefined
const WEBHOOK_PATH = process.env.WEBHOOK_PATH
const WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN

// 5 minutes in milliseconds
const TELEGRAM_USER_WHITELIST = process.env.TELEGRAM_USER_WHITELIST?.split(',')

function connectApiToWs() {
  return new Observable<Asyncify<ServerWebsocketApi>>((subj) => {
    const url = BEATRIX_WS_URL?.replace(/^http/i, 'ws') + '/api/ws'
    d('Beatrix URL: %s', url)
    const ws = new WebSocket(url)

    fromEvent(ws, 'open')
      .pipe(
        map(() => {
          const msgs: Subject<IpcResponse> = new Subject()

          fromEvent(ws, 'message', (m) => m as MessageEvent)
            .pipe(
              mergeMap((msg) => {
                if (typeof msg.data !== 'string') {
                  return EMPTY
                }

                let resp: any
                try {
                  resp = JSON.parse(msg.data)
                } catch {
                  return EMPTY
                }

                if (
                  !resp ||
                  typeof resp !== 'object' ||
                  !('requestId' in resp) ||
                  !('type' in resp)
                ) {
                  return EMPTY
                }

                return of(resp as IpcResponse)
              })
            )
            .subscribe(msgs)

          return createRemoteClient<ServerWebsocketApi>(
            (m) => Promise.resolve(ws.send(m)),
            msgs
          )
        })
      )
      .subscribe({ next: (x) => subj.next(x) })

    fromEvent(ws, 'error').subscribe({
      next: (e) => {
        d('ws error: %o', JSON.stringify(e))
        subj.error(e)
      },
    })

    fromEvent(ws, 'close').subscribe({ next: () => subj.complete() })
  })
}

async function main(): Promise<void> {
  const convoCache = new LRUCache<string, number>({
    ttl: CONVERSATION_TIMEOUT_MS,
    max: 100,
  })

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_USER_WHITELIST) {
    console.error(
      'TELEGRAM_BOT_TOKEN and TELEGRAM_USER_WHITELIST environment variables are required'
    )
    throw new Error('Missing env vars')
  }

  // Initialize the bot
  console.log('Starting bot!')
  const bot = new Telegraf(TELEGRAM_BOT_TOKEN)

  let latestApi: Asyncify<ServerWebsocketApi> | null = null
  connectApiToWs()
    //.pipe(retry())
    .subscribe({
      next: (x) => {
        d('Connected to Beatrix instance %s', BEATRIX_WS_URL)
        latestApi = x
      },
      error: (e) => {
        console.error('Fail', e)
      },
    })

  // Handle incoming messages
  bot.on(message('text'), async (ctx) => {
    d('msg: %s', ctx.message.text)

    if (!TELEGRAM_USER_WHITELIST.includes(ctx.from.username ?? '<<NO>>')) {
      d('Invalid user %o', ctx.from)
      return
    }

    const id = convoCache.get(`id-${ctx.from.id}`)
    d('msg: %o', ctx.message)

    const rq = latestApi
      ?.handlePromptRequest(ctx.message.text, undefined, undefined, id)
      .pipe(share())

    if (!rq) return

    rq.subscribe((msg) => {
      if (msg.role === 'user') return

      const msgText = messagesToString([msg])
      if (msgText.length < 1) return

      convoCache.set(`id-${ctx.from.id}`, msg.serverId)
      void ctx.reply(msgText)
    })

    await lastValueFrom(rq)
  })

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))

  // Launch bot based on configuration
  if (WEBHOOK_DOMAIN && WEBHOOK_PORT) {
    // Production mode with webhooks
    const webhookConfig: LaunchOptions = {
      webhook: {
        domain: WEBHOOK_DOMAIN,
        port: WEBHOOK_PORT,
      },
    }

    // Add optional webhook configuration if provided
    if (WEBHOOK_PATH) {
      webhookConfig.webhook.path = WEBHOOK_PATH
    }

    if (WEBHOOK_SECRET_TOKEN) {
      webhookConfig.webhook.secretToken = WEBHOOK_SECRET_TOKEN
    }

    console.log('Starting bot in production mode with webhook')
    await bot.launch(webhookConfig)
    console.log(`Webhook is set up at ${WEBHOOK_DOMAIN}`)
  } else {
    // Development mode with long polling
    console.log('Starting bot in development mode with long polling')
    await bot.launch()
  }

  console.log('Bot started successfully')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
