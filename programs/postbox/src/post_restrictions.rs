use anchor_lang::prelude::*;
use mpl_token_metadata;
use crate::errors::PostboxErrorCode;

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub enum PostRestrictionRule {
    TokenOwnership { mint: Pubkey, amount: u64 },
    NftOwnership { collection_id: Pubkey },
    Null,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub enum AdditionalAccountIndices {
    TokenOwnership { token_idx: u8 },
    NftOwnership { token_idx: u8, meta_idx: u8, collection_idx: u8 },
    Null,
}

impl PostRestrictionRule {
    pub fn get_size(&self) -> usize {
        return match self.try_to_vec() {
            Ok(v) => v.len(),
            Err(_) => 0,
        };
    }

    pub fn validate_reply_allowed(&self,
        poster: &Pubkey,
        extra_accounts: &[AccountInfo],
        account_indices_vec: &Vec<AdditionalAccountIndices>,
        postbox: &crate::Postbox,
    ) -> Result<()> {
        if postbox.has_owner(poster) {
            return Ok(());
        }

        match self {
            PostRestrictionRule::TokenOwnership { mint, amount } => {
                let mut checked: bool = false;
                for account_indices in account_indices_vec {
                    if let AdditionalAccountIndices::TokenOwnership { token_idx } = account_indices {
                        let membership_token = &extra_accounts[usize::from(*token_idx)];
                        let token = Account::<anchor_spl::token::TokenAccount>::try_from(membership_token).map_err(
                            |_| Error::from(PostboxErrorCode::InvalidRestrictionExtraAccounts).with_source(source!())
                        )?;
                        let has_token = token.owner == *poster && token.mint == *mint && token.amount >= *amount;
                        require!(has_token, PostboxErrorCode::MissingTokenRestriction);
                        checked = true;
                    }
                }
                require!(checked, PostboxErrorCode::MissingRequiredOffsets);
            },

            PostRestrictionRule::NftOwnership { collection_id } => {
                let mut checked: bool = false;
                for account_indices in account_indices_vec {
                    if let AdditionalAccountIndices::NftOwnership { token_idx, meta_idx, collection_idx } = account_indices {
                        let membership_token = &extra_accounts[usize::from(*token_idx)];
                        let membership_mint_meta = &extra_accounts[usize::from(*meta_idx)];
                        let membership_collection = &extra_accounts[usize::from(*collection_idx)];
                        let token = Account::<anchor_spl::token::TokenAccount>::try_from(membership_token).map_err(
                            |_| Error::from(PostboxErrorCode::InvalidRestrictionExtraAccounts).with_source(source!())
                        )?;
                        let expected_meta_key = mpl_token_metadata::pda::find_metadata_account(& token.mint).0;
                        require!(membership_mint_meta.key() == expected_meta_key, PostboxErrorCode::InvalidMetadataKey);
                        let mint_meta = Account::<crate::nft_metadata::Metadata>::try_from(membership_mint_meta).map_err(
                            |_| Error::from(PostboxErrorCode::InvalidRestrictionExtraAccounts).with_source(source!())
                        )?;
                        require!(mint_meta.collection.is_some(), PostboxErrorCode::NoCollectionOnMetadata);
                        let collection = mint_meta.collection.as_ref().unwrap();
                        let has_collection_nft = token.owner == *poster
                            && token.amount == 1
                            && collection.verified
                            && collection.key == *collection_id
                            && collection.key == membership_collection.key()
                            && *membership_collection.owner == anchor_spl::token::ID;
                        require!(has_collection_nft, PostboxErrorCode::MissingCollectionNftRestriction);
                        checked = true;
                    }
                }
                require!(checked, PostboxErrorCode::MissingRequiredOffsets);
            },

            PostRestrictionRule::Null => {},
        }

        Ok(())
    }
}
