import { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'
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
  retry,
  share,
  tap,
} from 'rxjs'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'

import { ServerWebsocketApi } from './lib/api'
import { Asyncify, IpcResponse } from './lib/ws-rpc'
import { createRemoteClient } from './lib/ws-rpc-client'

// Load environment variables
config()

const d = debug('b:telegram')

// Environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const BEATRIX_URL = process.env.BEATRIX_URL
const CONVERSATION_TIMEOUT_MS = parseInt(
  process.env.CONVERSATION_TIMEOUT_MS || '300000',
  10
)

// 5 minutes in milliseconds
const TELEGRAM_USER_WHITELIST = process.env.TELEGRAM_USER_WHITELIST?.split(',')

function connectApiToWs() {
  return new Observable<Asyncify<ServerWebsocketApi>>((subj) => {
    const url = BEATRIX_URL?.replace(/^http/i, 'ws') + '/api/ws'
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
    .pipe(
      tap({
        error: (e: any) => {
          console.error('Error connecting to Beatrix instance %s', BEATRIX_URL)
          console.error(e)
        },
      }),
      retry()
    )
    .subscribe({
      next: (x) => {
        d('Connected to Beatrix instance %s', BEATRIX_URL)
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

    try {
      const id = convoCache.get(`id-${ctx.from.id}`)
      d('msg: %o', ctx.message)

      const rq = latestApi
        ?.handlePromptRequest(
          ctx.message.text,
          undefined,
          undefined,
          id,
          'chat'
        )
        .pipe(share())

      if (!rq) return

      rq.subscribe((msg) => {
        if (msg.role === 'user') return

        const msgText = messagesToStringTelegram([msg])
        if (msgText.length < 1) return

        convoCache.set(`id-${ctx.from.id}`, msg.serverId)
        void ctx.reply(msgText)
      })

      await lastValueFrom(rq)
    } catch (e) {
      console.error('Failed to send message', e)
    }
  })

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))

  console.log('Starting bot in long polling mode')
  await bot.launch()

  console.log('Bot started successfully')
}

export function messagesToStringTelegram(
  msgs: MessageParam[],
  annotateSides: boolean = false
) {
  return msgs
    .reduce((acc, msg) => {
      const side = annotateSides ? `${msg.role}: ` : ''

      if (msg.content instanceof Array) {
        msg.content.forEach((subMsg) => {
          switch (subMsg.type) {
            case 'text':
              acc.push(side + subMsg.text)
              break
            /*
            case 'tool_use':
              acc.push(
                `Running tool: ${subMsg.name}, ${JSON.stringify(subMsg.input)}\n`
              )
              break
            case 'tool_result':
              acc.push(`${JSON.stringify(subMsg.content)}\n`)
              break
              */
          }
        })
      } else {
        acc.push(side + msg.content)
      }

      return acc
    }, [] as string[])
    .join('\n\n---\n\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
