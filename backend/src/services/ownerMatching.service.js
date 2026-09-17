/**
 * Voice Owner Matching Service (Deferred: AI Pipeline)
 *
 * Matches speaker voice embeddings to enrolled team members.
 * Currently a placeholder stub returning null.
 */

/**
 * Match a speaker embedding to a user ID.
 * @param {Array<number>|string} speakerEmbedding - Voice embedding vector or identifier.
 * @param {string} [teamId] - Scoped team ID.
 * @returns {Promise<string|null>} User ID or null if unassigned.
 */
async function matchOwnerByVoice(speakerEmbedding, teamId) {
  // TODO: Match speaker vector against user voice profile embeddings in DB/storage
  console.log("[ownerMatching.service] matchOwnerByVoice called for team:", teamId);
  return null;
}

module.exports = {
  matchOwnerByVoice,
};
