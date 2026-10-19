export { boxesOverlap, sphereOverlapsBox } from "./geometry";
export { box, sphere, shapeOverlapsBox, shapeReach } from "./shapes";
export type { BoxShape, HitboxShape, SphereShape } from "./shapes";
export { sweepShape } from "./sweep";
export { defineSwing, isPhaseActive, phase } from "./swing";
export type { HitboxPhase, SwingConfig, SwingDefinition } from "./swing";
export { PoseHistory } from "./pose-history";
export { DEFAULT_HURTBOX, hurtboxAt } from "./world";
export type { Clock, FrameSignal, Hurtbox, PoseReader } from "./world";
export type {
	ClientTransport,
	HitClaim,
	HitResult,
	RejectReason,
	ServerTransport,
	SwingRejection,
	SwingStart,
} from "./messages";
export { HitboxServer } from "./server";
export type { HitboxServerOptions } from "./server";
export { HitboxClient } from "./client";
export type { HitboxClientOptions } from "./client";
export { createClientTransport, createServerTransport } from "./remote-transport";
export { createLoopbackTransport } from "./loopback-transport";
export type { LoopbackTransport } from "./loopback-transport";
