import { Players, RunService } from "@rbxts/services";
import { HitClaim, RejectReason, ServerTransport, SwingStart } from "./messages";
import { PoseHistory } from "./pose-history";
import { shapeOverlapsBox } from "./shapes";
import { sweepShape } from "./sweep";
import { HitboxPhase, SwingDefinition, isPhaseActive } from "./swing";
import { Clock, DEFAULT_HURTBOX, FrameSignal, Hurtbox, PoseReader, hurtboxAt, rootPose, serverTime } from "./world";

const SERVER_FRAME_RATE = 60;

// how long roblox buffers other characters before rendering them, on top of the network delay
const INTERPOLATION_DELAY = 0.1;

export interface HitboxServerOptions {
	readonly swings: Readonly<Record<string, SwingDefinition>>;
	readonly transport: ServerTransport;
	readonly onHit: (attacker: Player, target: Model, swing: string, phase: number) => void;
	readonly clock?: Clock;
	readonly frame?: FrameSignal;
	readonly poseOf?: PoseReader;
	readonly characterOf?: (player: Player) => Model | undefined;
	// how far behind the server the attacker sees other characters
	readonly viewDelay?: (player: Player) => number;
	readonly hurtbox?: Hurtbox;
	readonly maxRewind?: number;
	readonly historyLength?: number;
	readonly tolerance?: number;
	readonly timingTolerance?: number;
	readonly maxClockAhead?: number;
	readonly sweepWindow?: number;
}

interface ActiveSwing {
	readonly id: number;
	readonly name: string;
	readonly definition: SwingDefinition;
	readonly start: number;
	readonly hits: Set<Model>;
}

export class HitboxServer {
	private readonly histories = new Map<Model, PoseHistory>();
	private readonly swings = new Map<Player, ActiveSwing>();
	private readonly lastSwingIds = new Map<Player, number>();
	private readonly disconnects = new Array<() => void>();

	private readonly clock: Clock;
	private readonly poseOf: PoseReader;
	private readonly characterOf: (player: Player) => Model | undefined;
	private readonly viewDelay: (player: Player) => number;
	private readonly hurtbox: Hurtbox;
	private readonly hurtboxReach: number;
	private readonly capacity: number;
	private readonly maxRewind: number;
	private readonly tolerance: number;
	private readonly timingTolerance: number;
	private readonly maxClockAhead: number;
	private readonly sweepWindow: number;

	public constructor(private readonly options: HitboxServerOptions) {
		this.clock = options.clock ?? serverTime;
		this.poseOf = options.poseOf ?? rootPose;
		this.characterOf = options.characterOf ?? ((player) => player.Character);
		this.viewDelay = options.viewDelay ?? ((player) => player.GetNetworkPing() / 2 + INTERPOLATION_DELAY);
		this.hurtbox = options.hurtbox ?? DEFAULT_HURTBOX;
		this.hurtboxReach = this.hurtbox.size.Magnitude / 2;
		this.maxRewind = options.maxRewind ?? 0.25;
		this.tolerance = options.tolerance ?? 1;
		this.timingTolerance = options.timingTolerance ?? 0.05;
		this.maxClockAhead = options.maxClockAhead ?? 0.1;
		this.sweepWindow = options.sweepWindow ?? 1 / 30;

		const historyLength = options.historyLength ?? 1;
		if (historyLength < this.maxRewind + this.sweepWindow) {
			throw `historyLength (${historyLength}s) has to cover maxRewind plus sweepWindow`;
		}
		this.capacity = math.ceil(historyLength * SERVER_FRAME_RATE) + 1;

		const recording = (options.frame ?? RunService.Heartbeat).Connect(() => this.record());
		this.disconnects.push(
			() => recording.Disconnect(),
			options.transport.onSwing((player, start) => this.startSwing(player, start)),
			options.transport.onClaim((player, claim) => this.resolveClaim(player, claim)),
		);
	}

	public track(model: Model): void {
		if (!this.histories.has(model)) {
			this.histories.set(model, new PoseHistory(this.capacity));
		}
	}

	public untrack(model: Model): void {
		this.histories.delete(model);
	}

	public isTracked(model: Model): boolean {
		return this.histories.has(model);
	}

	// tracks every player's character while it exists and drops swing state when players leave
	public trackPlayers(): () => void {
		const connections = new Array<RBXScriptConnection>();
		const watch = (player: Player) => {
			if (player.Character) {
				this.track(player.Character);
			}
			connections.push(
				player.CharacterAdded.Connect((character) => this.track(character)),
				player.CharacterRemoving.Connect((character) => this.untrack(character)),
			);
		};

		for (const player of Players.GetPlayers()) {
			watch(player);
		}
		connections.push(
			Players.PlayerAdded.Connect(watch),
			Players.PlayerRemoving.Connect((player) => this.forget(player)),
		);

		return () => {
			for (const connection of connections) {
				connection.Disconnect();
			}
		};
	}

	public forget(player: Player): void {
		this.swings.delete(player);
		this.lastSwingIds.delete(player);
	}

	public destroy(): void {
		for (const disconnect of this.disconnects) {
			disconnect();
		}
		this.disconnects.clear();
		this.histories.clear();
		this.swings.clear();
		this.lastSwingIds.clear();
	}

	private record(): void {
		const now = this.clock();
		for (const [model, history] of this.histories) {
			const pose = this.poseOf(model);
			if (pose) {
				history.push(now, pose);
			}
		}
	}

	private startSwing(player: Player, start: SwingStart): void {
		const now = this.clock();
		const definition: SwingDefinition | undefined = this.options.swings[start.swing];
		if (definition === undefined) {
			return this.rejectSwing(player, start, "UnknownSwing");
		}
		if (start.id <= (this.lastSwingIds.get(player) ?? -math.huge)) {
			return this.rejectSwing(player, start, "StaleSwing");
		}
		if (start.time > now + this.maxClockAhead) {
			return this.rejectSwing(player, start, "FutureTimestamp");
		}

		// a client can't push its swing further into the past than targets can be rewound
		const startTime = math.max(start.time, now - this.maxRewind);
		const current = this.swings.get(player);
		if (current && startTime < current.start + current.definition.duration - this.timingTolerance) {
			return this.rejectSwing(player, start, "SwingOverlap");
		}

		this.lastSwingIds.set(player, start.id);
		this.swings.set(player, { id: start.id, name: start.swing, definition, start: startTime, hits: new Set() });
	}

	private rejectSwing(player: Player, start: SwingStart, reason: RejectReason): void {
		this.options.transport.sendSwingRejection(player, { id: start.id, reason });
	}

	private resolveClaim(player: Player, claim: HitClaim): void {
		const swing = this.swings.get(player);
		const reason = swing && swing.id === claim.id ? this.judge(player, swing, claim) : "UnknownSwing";

		this.options.transport.sendHitResult(player, {
			id: claim.id,
			target: claim.target,
			accepted: reason === undefined,
			reason,
		});

		if (swing && reason === undefined) {
			swing.hits.add(claim.target);
			this.options.onHit(player, claim.target, swing.name, claim.phase);
		}
	}

	private judge(player: Player, swing: ActiveSwing, claim: HitClaim): RejectReason | undefined {
		const now = this.clock();
		const { definition } = swing;
		const phase: HitboxPhase | undefined = definition.phases[claim.phase];

		if (claim.time > now + this.maxClockAhead) return "FutureTimestamp";
		if (phase === undefined || !isPhaseActive(phase, claim.time - swing.start, this.timingTolerance)) {
			return "OutsideWindow";
		}

		const target = claim.target;
		const character = this.characterOf(player);
		if (target === character) return "SelfHit";
		if (swing.hits.has(target)) return "Duplicate";
		if (swing.hits.size() >= definition.maxTargets) return "TooManyTargets";

		const attackerHistory = character ? this.histories.get(character) : undefined;
		const attacker = attackerHistory?.latest();
		if (!attackerHistory || !attacker) return "NoCharacter";

		const targetHistory = this.histories.get(target);
		if (!targetHistory) return "UnknownTarget";

		// the attacker's own movement reaches the server as late as the claim does, so its newest pose is
		// the one it swung from. targets get rewound to what the attacker was looking at instead
		const viewTime = math.clamp(claim.time - this.viewDelay(player), now - this.maxRewind, now);
		const targetRoot = targetHistory.sampleClamped(viewTime);
		if (!targetRoot) return "UnknownTarget";

		const hurt = hurtboxAt(this.hurtbox, targetRoot);
		const reach = definition.reach + this.hurtboxReach + this.tolerance;
		if (attacker.Position.sub(hurt.Position).Magnitude > reach) return "OutOfRange";
		if (shapeOverlapsBox(phase.shape, attacker, hurt, this.hurtbox.size, this.tolerance)) return undefined;

		// the client sweeps between frames, so a fast swing gets the same treatment over the last sweepWindow
		const attackerTime = attackerHistory.newestTime() ?? now;
		const attackerBefore = attackerHistory.sampleClamped(attackerTime - this.sweepWindow) ?? attacker;
		const targetBefore = targetHistory.sampleClamped(viewTime - this.sweepWindow) ?? targetRoot;
		const contact = sweepShape(
			phase.shape,
			attackerBefore,
			attacker,
			hurtboxAt(this.hurtbox, targetBefore),
			hurt,
			this.hurtbox.size,
			this.tolerance,
		);
		return contact !== undefined ? undefined : "NoOverlap";
	}
}
