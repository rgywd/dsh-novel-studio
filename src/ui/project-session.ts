export interface SessionTicket {
  projectId?: string;
  session: number;
  intent: string;
  sequence: number;
  signal: AbortSignal;
}

export class ProjectSessionCoordinator {
  private projectId?: string;
  private session = 0;
  private sequence = 0;
  private controllers = new Map<string, AbortController>();
  private latest = new Map<string, number>();

  enter(projectId?: string, intent = 'open') {
    this.abortAll();
    this.projectId = projectId;
    this.session++;
    return this.begin(projectId, intent);
  }

  begin(projectId: string | undefined, intent: string): SessionTicket {
    if (projectId !== this.projectId) return this.stale(projectId, intent);
    this.controllers.get(intent)?.abort();
    const controller = new AbortController();
    const sequence = ++this.sequence;
    this.controllers.set(intent, controller);
    this.latest.set(intent, sequence);
    return { projectId, session: this.session, intent, sequence, signal: controller.signal };
  }

  commit(ticket: SessionTicket, apply: () => void) {
    if (!this.current(ticket)) return false;
    apply();
    return true;
  }

  current(ticket: SessionTicket) {
    return ticket.projectId === this.projectId
      && ticket.session === this.session
      && ticket.sequence === this.latest.get(ticket.intent)
      && !ticket.signal.aborted;
  }

  leave() { return this.enter(undefined, 'library'); }

  abort(intent: string) {
    this.controllers.get(intent)?.abort();
    this.controllers.delete(intent);
    this.latest.delete(intent);
  }

  private abortAll() {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.latest.clear();
  }

  private stale(projectId: string | undefined, intent: string): SessionTicket {
    const controller = new AbortController();
    controller.abort();
    return { projectId, session: -1, intent, sequence: -1, signal: controller.signal };
  }
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
