use anchor_lang::prelude::*;

#[error_code]
pub enum PostboxErrorCode {
    // Postbox initialize errors
    #[msg("If no target string, target account must be the signer")]
    NotPersonalPostbox,
    #[msg("The description provided is not a description setting")]
    BadDescriptionSetting,

    // Create post errors
    #[msg("The provided post ID is too large an increase")]
    PostIdTooLarge = 100,
    #[msg("The reply-to account is not a Post account")]
    ReplyToNotPost,
    #[msg("Replies cannot have a further reply restriction")]
    ReplyCannotRestrictReplies,
    #[msg("Invalid setting type for post")]
    PostInvalidSettingsType,

    // Post restriction errors
    #[msg("The provided token account is not a token account")]
    NotTokenAccount = 200,
    #[msg("Missing the token required by the restriction")]
    MissingTokenRestriction,
    #[msg("Account provided is not expected metadata key")]
    InvalidMetadataKey,
    #[msg("The provided account is not a metadata account")]
    MetadataAccountInvalid,
    #[msg("No collection set on the metadata")]
    NoCollectionOnMetadata,
    #[msg("Missing an NFT from the collection required by the restriction")]
    MissingCollectionNftRestriction,
    #[msg("Cannot parse a setting")]
    MalformedSetting,
    #[msg("Extra account offsets invalid for this restriction type")]
    InvalidRestrictionExtraAccounts,
    #[msg("Must supply offsets when a post restriction applies")]
    MissingRequiredOffsets,
    #[msg("We hit the test error")]
    TestError,
    #[msg("Already voted on this post")]
    AlreadyVoted,
}
