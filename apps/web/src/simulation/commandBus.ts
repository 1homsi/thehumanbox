import { FAILED_OUTCOME, type CommandOutcome } from './command-outcome'
import type { SandboxCommand } from './sandbox'

type Sender = (cmd: SandboxCommand) => Promise<CommandOutcome>

let sender: Sender | null = null

/** The app registers how to send a world command; panels that are not wired to it can still send one. */
export function setSandboxSender(next: Sender | null): void {
  sender = next
}

/** Sends a command and says what it did (see command-outcome.ts). */
export function sendSandboxCommandOutcome(cmd: SandboxCommand): Promise<CommandOutcome> {
  return sender ? sender(cmd) : Promise.resolve(FAILED_OUTCOME)
}

/** Sends a command and says only whether the world changed. */
export function sendSandboxCommand(cmd: SandboxCommand): Promise<boolean> {
  return sendSandboxCommandOutcome(cmd).then((outcome) => outcome.applied)
}
