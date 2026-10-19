import { box, defineSwing, phase, sphere } from "@skyzwrl/hitboxes";

// shared by server and client so both judge the exact same shapes and timings
export const SWINGS = {
	jab: defineSwing({
		duration: 0.45,
		phases: [phase(box(new Vector3(3, 3, 4), new CFrame(0, 0.5, -2.5)), 0.12, 0.22)],
	}),

	sweep: defineSwing({
		duration: 0.8,
		maxTargets: 4,
		phases: [
			phase(box(new Vector3(8, 3, 3), new CFrame(0, 0, -3)), 0.25, 0.35),
			phase(sphere(4, new Vector3(0, 0, -4)), 0.35, 0.45),
		],
	}),
};

export const DAMAGE: Record<keyof typeof SWINGS, number> = {
	jab: 8,
	sweep: 14,
};
