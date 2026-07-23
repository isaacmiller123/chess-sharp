// A6 social core (spec §3/§10): friend edges + profile records.
// A7 adds the transport layer (overlay presence/mail/friend-exchange) and the
// §10 edge-strength fold. Platform-neutral and deterministic throughout.
export * from './friends'
export * from './profile'
export * from './presence'
export * from './mailbox'
export * from './edgeStrength'
export * from './transport'
