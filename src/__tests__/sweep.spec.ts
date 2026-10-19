/// <reference types="@rbxts/testez/globals" />

import { box, shapeOverlapsBox } from "../shapes";
import { sweepShape } from "../sweep";

export = () => {
	const fist = box(new Vector3(1, 1, 1));
	const wall = new Vector3(0.2, 4, 4);

	describe("sweepShape", () => {
		it("catches a target the swing passes through between frames", () => {
			const from = new CFrame(-3, 0, 0);
			const to = new CFrame(3, 0, 0);

			expect(shapeOverlapsBox(fist, from, new CFrame(), wall)).to.equal(false);
			expect(shapeOverlapsBox(fist, to, new CFrame(), wall)).to.equal(false);

			const alpha = sweepShape(fist, from, to, new CFrame(), new CFrame(), wall);
			expect(alpha).to.be.ok();
			expect(alpha! > 0.3 && alpha! < 0.6).to.equal(true);
		});

		it("follows the arc of a turning attacker instead of cutting the corner", () => {
			const reach = box(new Vector3(1, 1, 1), new CFrame(0, 0, -8));
			const facing = new CFrame();
			const turned = CFrame.Angles(0, math.rad(90), 0);
			const onArc = new CFrame(-8 * math.sin(math.rad(45)), 0, -8 * math.cos(math.rad(45)));
			const post = new Vector3(1, 4, 1);

			expect(shapeOverlapsBox(reach, facing, onArc, post)).to.equal(false);
			expect(shapeOverlapsBox(reach, turned, onArc, post)).to.equal(false);
			expect(sweepShape(reach, facing, turned, onArc, onArc, post)).to.be.ok();
		});

		it("follows a target moving across the shape", () => {
			const jab = box(new Vector3(1, 1, 1), new CFrame(0, 0, -2));
			const alpha = sweepShape(
				jab,
				new CFrame(),
				new CFrame(),
				new CFrame(-4, 0, -2),
				new CFrame(4, 0, -2),
				wall,
			);
			expect(alpha).to.be.ok();
		});

		it("only tests the requested slice of the move", () => {
			const from = new CFrame(-3, 0, 0);
			const to = new CFrame(3, 0, 0);

			expect(sweepShape(fist, from, to, new CFrame(), new CFrame(), wall, 0, 0.7, 1)).never.to.be.ok();
			const alpha = sweepShape(fist, from, to, new CFrame(), new CFrame(), wall, 0, 0.3, 0.6);
			expect(alpha).to.be.ok();
			expect(alpha! >= 0.3 && alpha! <= 0.6).to.equal(true);
		});

		it("returns the start of the slice when already touching", () => {
			const alpha = sweepShape(
				fist,
				new CFrame(),
				new CFrame(0.2, 0, 0),
				new CFrame(),
				new CFrame(),
				wall,
				0,
				0.25,
			);
			expect(alpha).to.equal(0.25);
		});

		it("misses when nothing ever touches", () => {
			const from = new CFrame(-3, 5, 0);
			const to = new CFrame(3, 5, 0);
			expect(sweepShape(fist, from, to, new CFrame(), new CFrame(), wall)).never.to.be.ok();
		});
	});
};
