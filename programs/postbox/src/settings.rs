use anchor_lang::prelude::*;
use crate::post_restrictions::PostRestrictionRule;

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub enum SettingsType {
    Description,
    OwnerInfo,
    PostRestriction,
    Null,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub enum SettingsData {
    Description { title: String, desc: String },
    OwnerInfo { owners: Vec<Pubkey> },
    PostRestriction { post_restriction: PostRestrictionRule },
    Null,
}

impl SettingsData {
    pub fn get_size(&self) -> usize {
        return match self.try_to_vec() {
            Ok(v) => v.len(),
            Err(_) => 0,
        };
    }

    pub fn get_type(&self) -> SettingsType {
        return match self {
            SettingsData::Description { title: _, desc: _ } => SettingsType::Description,
            SettingsData::OwnerInfo { owners: _ } => SettingsType::OwnerInfo,
            SettingsData::PostRestriction { post_restriction: _ } => SettingsType::PostRestriction,
            SettingsData::Null => SettingsType::Null,
        };
    }
}
