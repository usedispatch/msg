// TODO: contribute this to anchor

use anchor_lang::prelude::*;
use std::ops::Deref;
use mpl_token_metadata;

#[derive(Clone)]
pub struct Metadata(mpl_token_metadata::state::Metadata);

// The "try_deserialize" function delegates to
// "try_deserialize_unchecked" by default which is what we want here
// because non-anchor accounts don't have a discriminator to check
impl anchor_lang::AccountDeserialize for Metadata {
    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        mpl_token_metadata::deser::meta_deser(buf).map(Metadata).map_err(|e| e.into())
    }
}

// AccountSerialize defaults to a no-op which is what we want here
// because it's a foreign program, so our program does not
// have permission to write to the foreign program's accounts anyway
impl anchor_lang::AccountSerialize for Metadata {}

impl anchor_lang::Owner for Metadata {
    fn owner() -> Pubkey {
        mpl_token_metadata::ID
    }
}

// Implement the "std::ops::Deref" trait for better user experience
impl Deref for Metadata {
    type Target = mpl_token_metadata::state::Metadata;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
