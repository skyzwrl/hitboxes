/// <reference types="@rbxts/testez/globals" />

import { box, sphere } from "../shapes";
import { defineSwing, isPhaseActive, phase } from "../swing";

export = () => {
	describe("defineSwing", () => {
		it("works out reach from the furthest shape", () => {
			const swing = defineSwing({
				duration: 0.6,
				phases: [
					phase(box(new Vector3(4, 4, 4), new CFrame(0, 0, -3)), 0.1, 0.2),
					phase(sphere(2, new Vector3(0, 0, -6)), 0.2, 0.3),
				],
			});
			expect(swing.reach).to.be.near(8, 1e-6);
			expect(swing.maxTargets).to.equal(math.huge);
		});

		it("rejects windows that don't fit inside the swing", () => {
			const shape = sphere(1);
			expect(() => defineSwing({ duration: 0.5, phases: [phase(shape, 0.4, 0.6)] })).to.throw("phase 0");
			expect(() => defineSwing({ duration: 0.5, phases: [phase(shape, 0.3, 0.2)] })).to.throw("phase 0");
			expect(() => defineSwing({ duration: 0.5, phases: [phase(shape, -0.1, 0.2)] })).to.throw("phase 0");
		});

		it("rejects empty or broken swings", () => {
			expect(() => defineSwing({ duration: 0, phases: [phase(sphere(1), 0, 0.1)] })).to.throw("duration");
			expect(() => defineSwing({ duration: 0.5, phases: [] })).to.throw("at least one");
			expect(() => defineSwing({ duration: 0.5, phases: [phase(sphere(1), 0, 0.1)], maxTargets: 0 })).to.throw(
				"maxTargets",
			);
		});

		it("rejects shapes with no volume", () => {
			expect(() => box(new Vector3(1, 0, 1))).to.throw("positive");
			expect(() => sphere(0)).to.throw("positive");
		});
	});

	describe("isPhaseActive", () => {
		const window = phase(sphere(1), 0.1, 0.2);

		it("includes both ends of the window", () => {
			expect(isPhaseActive(window, 0.1)).to.equal(true);
			expect(isPhaseActive(window, 0.2)).to.equal(true);
			expect(isPhaseActive(window, 0.09)).to.equal(false);
			expect(isPhaseActive(window, 0.21)).to.equal(false);
		});

		it("widens the window by the slack", () => {
			expect(isPhaseActive(window, 0.24, 0.05)).to.equal(true);
			expect(isPhaseActive(window, 0.06, 0.05)).to.equal(true);
			expect(isPhaseActive(window, 0.26, 0.05)).to.equal(false);
		});
	});
};
