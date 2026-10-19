import { RunService } from "@rbxts/services";
import { ClientTransport, HitResult, RejectReason, SwingRejection } from "./messages";
import { sweepShape } from "./sweep";
import { SwingDefinition } from "./swing";
import { Clock, DEFAULT_HURTBOX, FrameSignal, Hurtbox, PoseReader, hurtboxAt, rootPose, serverTime } from "./world";

// results for older swings than this are no longer waited on
const KEPT_SWINGS = 8;

export interface HitboxClientOptions {
	readonly swings: Readonly<Record<string, SwingDefinition>>;
	readonly transport: ClientTransport;
	// the local character's root, read every frame while swinging
	readonly root: () => CFrame | undefined;
	// models that could be hit this frame, e.g. characters already near the attacker
	readonly targets: () => ReadonlyArray<Model>;
	readonly clock?: Clock;
	readonly frame?: FrameSignal;
	readonly poseOf?: PoseReader;
	readonly hurtbox?: Hurtbox;
	readonly onHit?: (target: Model, swing: string, phase: number) => void;
	readonly onConfirm?: (target: Model, swing: string) => void;
	readonly onUndo?: (target: Model, swing: string, reason: RejectReason) => void;
	readonly onSwingRejected?: (swing: string, reason: RejectReason) => void;
}

interface LocalSwing {
	readonly id: number;
	readonly name: string;
	readonly definition: SwingDefinition;
	readonly start: number;
	readonly hits: Set<Model>;
	readonly targetPoses: Map<Model, CFrame>;
	elapsed: number;
	root: CFrame;
}

interface PendingSwing {
	readonly name: string;
	readonly hits: Set<Model>;
}

export class HitboxClient {
	private current?: LocalSwing;
	private lastId: number;
	private readonly pending = new Map<number, PendingSwing>();
	private readonly disconnects = new Array<() => void>();

	private readonly clock: Clock;
	private readonly poseOf: PoseReader;
	private readonly hurtbox: Hurtbox;

	public constructor(private readonly options: HitboxClientOptions) {
		this.clock = options.clock ?? serverTime;
		this.poseOf = options.poseOf ?? rootPose;
		this.hurtbox = options.hurtbox ?? DEFAULT_HURTBOX;
		// seeded from the clock so ids keep climbing if the client is recreated, e.g. on respawn
		this.lastId = math.floor(this.clock() * 1000);

		const stepping = (options.frame ?? RunService.Heartbeat).Connect(() => this.step());
		this.disconnects.push(
			() => stepping.Disconnect(),
			options.transport.onHitResult((result) => this.resolveHit(result)),
			options.transport.onSwingRejection((rejection) => this.rejectSwing(rejection)),
		);
	}

	// starts a predicted swing now, returns its id or undefined while another swing is still playing
	public swing(name: string): number | undefined {
		const definition: SwingDefinition | undefined = this.options.swings[name];
		if (definition === undefined) {
			throw `unknown swing "${name}"`;
		}

		const root = this.options.root();
		if (this.current || !root) {
			return undefined;
		}

		this.lastId += 1;
		const id = this.lastId;
		const start = this.clock();

		this.current = {
			id,
			name,
			definition,
			start,
			hits: new Set(),
			targetPoses: new Map(),
			elapsed: 0,
			root,
		};
		this.pending.set(id, { name, hits: new Set() });
		this.pending.delete(id - KEPT_SWINGS);

		this.options.transport.sendSwing({ id, swing: name, time: start });
		return id;
	}

	public isSwinging(): boolean {
		return this.current !== undefined;
	}

	public cancel(): void {
		this.current = undefined;
	}

	public destroy(): void {
		for (const disconnect of this.disconnects) {
			disconnect();
		}
		this.disconnects.clear();
		this.current = undefined;
		this.pending.clear();
	}

	private step(): void {
		const swing = this.current;
		if (!swing) {
			return;
		}

		const root = this.options.root();
		if (!root) {
			this.current = undefined;
			return;
		}

		const { definition } = swing;
		const phases = definition.phases;
		const previousElapsed = swing.elapsed;
		const elapsed = math.min(this.clock() - swing.start, definition.duration);
		const span = elapsed - previousElapsed;

		for (const target of this.options.targets()) {
			const pose = this.poseOf(target);
			if (!pose) {
				continue;
			}

			const previousPose = swing.targetPoses.get(target) ?? pose;
			swing.targetPoses.set(target, pose);
			if (swing.hits.has(target)) {
				continue;
			}

			let hurtFrom: CFrame | undefined;
			let hurtTo: CFrame | undefined;

			for (let index = 0; index < phases.size(); index++) {
				const phase = phases[index];
				if (phase.to < previousElapsed || phase.from > elapsed) {
					continue;
				}

				hurtFrom ??= hurtboxAt(this.hurtbox, previousPose);
				hurtTo ??= hurtboxAt(this.hurtbox, pose);

				// only test the slice of this frame the phase was actually active for, so a window shorter
				// than a frame still gets checked
				const fromAlpha = span > 0 ? math.max((phase.from - previousElapsed) / span, 0) : 1;
				const toAlpha = span > 0 ? math.min((phase.to - previousElapsed) / span, 1) : 1;
				const alpha = sweepShape(
					phase.shape,
					swing.root,
					root,
					hurtFrom,
					hurtTo,
					this.hurtbox.size,
					0,
					fromAlpha,
					toAlpha,
				);

				if (alpha !== undefined) {
					this.predictHit(swing, target, index, swing.start + previousElapsed + span * alpha);
					break;
				}
			}
		}

		swing.elapsed = elapsed;
		swing.root = root;
		if (elapsed >= definition.duration) {
			this.current = undefined;
		}
	}

	private predictHit(swing: LocalSwing, target: Model, phase: number, time: number): void {
		swing.hits.add(target);
		this.pending.get(swing.id)?.hits.add(target);
		this.options.transport.sendClaim({ id: swing.id, target, phase, time });
		this.options.onHit?.(target, swing.name, phase);
	}

	private resolveHit(result: HitResult): void {
		const swing = this.pending.get(result.id);
		if (!swing || !swing.hits.delete(result.target)) {
			return;
		}

		if (result.accepted) {
			this.options.onConfirm?.(result.target, swing.name);
		} else {
			this.options.onUndo?.(result.target, swing.name, result.reason ?? "NoOverlap");
		}
	}

	private rejectSwing(rejection: SwingRejection): void {
		const swing = this.pending.get(rejection.id);
		if (!swing) {
			return;
		}

		this.pending.delete(rejection.id);
		if (this.current?.id === rejection.id) {
			this.current = undefined;
		}

		for (const target of swing.hits) {
			this.options.onUndo?.(target, swing.name, rejection.reason);
		}
		this.options.onSwingRejected?.(swing.name, rejection.reason);
	}
}
