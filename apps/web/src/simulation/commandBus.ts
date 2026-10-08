import type { SandboxCommand } from './sandbox'

type Sender = (cmd: SandboxCommand) => Promise<boolean>

let sender: Sender | null = null

/** The app registers how to send a world command; panels that are not wired to it can still send one. */
export function setSandboxSender(next: Sender | null): void {
  sender = next
}

export function sendSandboxCommand(cmd: SandboxCommand): Promise<boolean> {
  return sender ? sender(cmd) : Promise.resolve(false)
}
