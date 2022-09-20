use anchor_lang::prelude::*;

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub struct VoteEntry {
    pub post_id: u32,
    pub up_vote: bool,
}
