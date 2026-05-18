

pub mod start_school;
pub mod teach_class;
pub mod graduate_student;
pub mod write_scroll;
pub mod copy_scroll;
pub mod read_scroll;
pub mod preserve_knowledge;
pub mod burn_scroll;
pub mod debate_philosophy;
pub mod form_academy;
pub mod give_lecture;
pub mod mentor_apprentice;
pub mod test_knowledge;
pub mod award_mastery;
pub mod challenge_belief;
pub mod recant_belief;
pub mod spread_learning;
pub mod compile_knowledge;
pub mod create_curriculum;
pub mod teach_language;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        501 => start_school::apply(ctx),
        502 => teach_class::apply(ctx),
        503 => graduate_student::apply(ctx),
        504 => write_scroll::apply(ctx),
        505 => copy_scroll::apply(ctx),
        506 => read_scroll::apply(ctx),
        507 => preserve_knowledge::apply(ctx),
        508 => burn_scroll::apply(ctx),
        509 => debate_philosophy::apply(ctx),
        510 => form_academy::apply(ctx),
        511 => give_lecture::apply(ctx),
        512 => mentor_apprentice::apply(ctx),
        513 => test_knowledge::apply(ctx),
        514 => award_mastery::apply(ctx),
        515 => challenge_belief::apply(ctx),
        516 => recant_belief::apply(ctx),
        517 => spread_learning::apply(ctx),
        518 => compile_knowledge::apply(ctx),
        519 => create_curriculum::apply(ctx),
        520 => teach_language::apply(ctx),
        _   => 0.0,
    }
}
