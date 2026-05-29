use std::collections::HashMap;

pub struct ConvoSpeaker {
    pub name: String,
    pub sex: String,
    pub age_days: u32,
    pub mood: String,
    pub tribe_name: Option<String>,
    pub partner_of: Option<String>,
    pub vocab: HashMap<String, String>,
    pub recent: Vec<String>,
}

pub struct ConversationReq {
    pub entry_id: String,
    pub kind: String,
    pub n_lines: usize,
    pub a: ConvoSpeaker,
    pub b: ConvoSpeaker,
}
