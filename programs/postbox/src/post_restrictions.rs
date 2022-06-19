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
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub enum PostRestrictionAccountIndices {
    TokenOwnership { token_idx: u8 },
    NftOwnership { token_idx: u8, meta_idx: u8, collection_idx: u8 },
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
        account_indices: &PostRestrictionAccountIndices,
    ) -> Result<()> {
        match self {
            PostRestrictionRule::TokenOwnership { mint, amount } => {
                if let PostRestrictionAccountIndices::TokenOwnership { token_idx } = account_indices {
                    let membership_token = &extra_accounts[Into::<usize>::into(*token_idx)];
                    let token = Account::<anchor_spl::token::TokenAccount>::try_from(membership_token).map_err(
                        |_| Error::from(PostboxErrorCode::InvalidRestrictionExtraAccounts).with_source(source!())
                    )?;
                    let has_token = token.owner == *poster && token.mint == *mint && token.amount >= *amount;
                    require!(has_token, PostboxErrorCode::MissingTokenRestriction);
                } else {
                    return Err(Error::from(PostboxErrorCode::InvalidRestrictionExtraAccounts).with_source(source!()));
                }
            },

            PostRestrictionRule::NftOwnership { collection_id } => {
                if let PostRestrictionAccountIndices::NftOwnership { token_idx, meta_idx, collection_idx } = account_indices {
                    let membership_token = &extra_accounts[Into::<usize>::into(*token_idx)];
                    let membership_mint_meta = &extra_accounts[Into::<usize>::into(*meta_idx)];
                    let membership_collection = &extra_accounts[Into::<usize>::into(*collection_idx)];
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
                        && collection.verified
                        && collection.key == *collection_id
                        && collection.key == membership_collection.key()
                        && *membership_collection.owner == anchor_spl::token::ID;
                    require!(has_collection_nft, PostboxErrorCode::MissingCollectionNftRestriction);
                } else {
                    return Err(Error::from(PostboxErrorCode::InvalidRestrictionExtraAccounts).with_source(source!()));
                }
            },
        }

        Ok(())
    }
}

pub fn get_reply_restriction_size(info: &AccountInfo) -> usize {
    let maybe_post = Account::<crate::Post>::try_from(info);
    if maybe_post.is_ok() {
        if let Some(restriction) = & maybe_post.unwrap().post_restrictions {
            return restriction.get_size();
        }
    }
    return 0;
}
