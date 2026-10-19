import { HitboxShape, shapeReach } from "./shapes";

export interface HitboxPhase {
	readonly shape: HitboxShape;
	readonly from: number;
	readonly to: number;
}

export interface SwingConfig {
	readonly duration: number;
	readonly phases: ReadonlyArray<HitboxPhase>;
	readonly maxTargets?: number;
}

export interface SwingDefinition {
	readonly duration: number;
	readonly phases: ReadonlyArray<HitboxPhase>;
	readonly maxTargets: number;
	readonly reach: number;
}

// from/to are seconds since the swing started
export function phase(shape: HitboxShape, from: number, to: number): HitboxPhase {
	return { shape, from, to };
}

export function defineSwing(config: SwingConfig): SwingDefinition {
	const { duration, phases } = config;
	const maxTargets = config.maxTargets ?? math.huge;

	if (!(duration > 0)) {
		throw `swing duration must be positive, got ${duration}`;
	}
	if (phases.isEmpty()) {
		throw "a swing needs at least one hitbox phase";
	}
	if (!(maxTargets >= 1)) {
		throw `maxTargets must be at least 1, got ${maxTargets}`;
	}

	let reach = 0;
	for (let index = 0; index < phases.size(); index++) {
		const { shape, from, to } = phases[index];
		if (!(from >= 0 && to > from && to <= duration)) {
			throw `phase ${index} runs ${from}s to ${to}s, which doesn't fit inside a ${duration}s swing`;
		}
		reach = math.max(reach, shapeReach(shape));
	}

	return { duration, phases, maxTargets, reach };
}

export function isPhaseActive(phase: HitboxPhase, elapsed: number, slack = 0): boolean {
	return elapsed >= phase.from - slack && elapsed <= phase.to + slack;
}
