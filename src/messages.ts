export type RejectReason =
	| "UnknownSwing"
	| "StaleSwing"
	| "SwingOverlap"
	| "FutureTimestamp"
	| "OutsideWindow"
	| "NoCharacter"
	| "UnknownTarget"
	| "SelfHit"
	| "Duplicate"
	| "TooManyTargets"
	| "OutOfRange"
	| "NoOverlap";

export interface SwingStart {
	readonly id: number;
	readonly swing: string;
	readonly time: number;
}

export interface HitClaim {
	readonly id: number;
	readonly target: Model;
	readonly phase: number;
	readonly time: number;
}

export interface HitResult {
	readonly id: number;
	readonly target: Model;
	readonly accepted: boolean;
	readonly reason?: RejectReason;
}

export interface SwingRejection {
	readonly id: number;
	readonly reason: RejectReason;
}

export interface ServerTransport {
	onSwing(handler: (player: Player, start: SwingStart) => void): () => void;
	onClaim(handler: (player: Player, claim: HitClaim) => void): () => void;
	sendHitResult(player: Player, result: HitResult): void;
	sendSwingRejection(player: Player, rejection: SwingRejection): void;
}

export interface ClientTransport {
	sendSwing(start: SwingStart): void;
	sendClaim(claim: HitClaim): void;
	onHitResult(handler: (result: HitResult) => void): () => void;
	onSwingRejection(handler: (rejection: SwingRejection) => void): () => void;
}
