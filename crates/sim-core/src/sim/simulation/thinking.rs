use super::*;

impl Simulation {
    pub(super) fn push_pending_convo(&mut self, req: crate::sim::convo_req::ConversationReq) {
        const MAX_PENDING_CONVOS: usize = 32;
        if self.pending_convos.len() >= MAX_PENDING_CONVOS {
            self.pending_convos.remove(0);
        }
        self.pending_convos.push(req);
    }

    pub(super) fn push_think_for(&mut self, org_idx: usize, mut trigger: ThinkTrigger) {
        trigger = trigger.with_traits(&self.organisms[org_idx]);
        // Inject world context so the LLM knows what era / season the
        // org lives in. Otherwise eras only show up as world events,
        // never in organism cognition.
        if trigger.world_era.is_empty() {
            trigger.world_era = self.current_era.clone();
        }
        if trigger.season.is_empty() {
            trigger.season = self.season().to_string();
        }
        if self.pending_thinks.len() >= 128 {
            self.pending_thinks.remove(0);
        }
        self.pending_thinks.push(trigger);
    }
}
