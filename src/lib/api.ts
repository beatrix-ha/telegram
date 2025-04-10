import { MessageParam } from '@anthropic-ai/sdk/resources/index.js'
import { Observable } from 'rxjs'

export type MessageParamWithExtras = MessageParam & {
  serverId: number
}

export interface ServerWebsocketApi {
  handlePromptRequest(
    prompt: string,
    model?: string,
    driver?: string,
    previousConversationId?: number
  ): Observable<MessageParamWithExtras>
}

export function messagesToString(
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
          }
        })
      } else {
        acc.push(side + msg.content)
      }

      return acc
    }, [] as string[])
    .join('\n\n---\n\n')
}
