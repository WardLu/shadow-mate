export function isCurrentWorkspaceMetadata(requestSession, currentSession) {
  return requestSession === currentSession;
}
