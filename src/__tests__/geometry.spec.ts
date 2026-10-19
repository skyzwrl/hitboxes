/// <reference types="@rbxts/testez/globals" />

import { boxesOverlap, sphereOverlapsBox } from "../geometry";
import { seededRandom } from "./fixtures";

function projectedRadius(cframe: CFrame, size: Vector3, axis: Vector3): number {
	return (
		(math.abs(cframe.RightVector.Dot(axis)) * size.X) / 2 +
		(math.abs(cframe.UpVector.Dot(axis)) * size.Y) / 2 +
		(math.abs(cframe.LookVector.Dot(axis)) * size.Z) / 2
	);
}

// straightforward 15 axis search to check the unrolled version against
function separation(a: CFrame, aSize: Vector3, b: CFrame, bSize: Vector3): [gap: number, byEdge: boolean] {
	const aAxes = [a.RightVector, a.UpVector, a.LookVector];
	const bAxes = [b.RightVector, b.UpVector, b.LookVector];
	const offset = b.Position.sub(a.Position);

	const gapAlong = (axis: Vector3) =>
		math.abs(offset.Dot(axis)) - projectedRadius(a, aSize, axis) - projectedRadius(b, bSize, axis);

	let faceGap = -math.huge;
	for (const axis of [...aAxes, ...bAxes]) {
		faceGap = math.max(faceGap, gapAlong(axis));
	}

	let edgeGap = -math.huge;
	for (const aAxis of aAxes) {
		for (const bAxis of bAxes) {
			const cross = aAxis.Cross(bAxis);
			if (cross.Magnitude > 1e-6) {
				edgeGap = math.max(edgeGap, gapAlong(cross.Unit));
			}
		}
	}

	return [math.max(faceGap, edgeGap), edgeGap > 0 && faceGap <= 0];
}

export = () => {
	describe("boxesOverlap", () => {
		it("overlaps identical boxes", () => {
			const size = new Vector3(2, 2, 2);
			expect(boxesOverlap(new CFrame(), size, new CFrame(), size)).to.equal(true);
		});

		it("separates boxes along a face axis", () => {
			const size = new Vector3(2, 2, 2);
			expect(boxesOverlap(new CFrame(), size, new CFrame(2.5, 0, 0), size)).to.equal(false);
			expect(boxesOverlap(new CFrame(), size, new CFrame(0, -2.01, 0), size)).to.equal(false);
		});

		it("counts touching faces as overlapping", () => {
			const size = new Vector3(2, 2, 2);
			expect(boxesOverlap(new CFrame(), size, new CFrame(2, 0, 0), size)).to.equal(true);
		});

		it("separates a rotated box sitting in the corner gap even though the bounds overlap", () => {
			const big = new Vector3(4, 4, 4);
			const small = new Vector3(1, 1, 1);
			const turned = new CFrame(2.55, 0, 2.55).mul(CFrame.Angles(0, math.rad(45), 0));
			expect(boxesOverlap(new CFrame(), big, turned, small)).to.equal(false);

			const closer = new CFrame(2.3, 0, 2.3).mul(CFrame.Angles(0, math.rad(45), 0));
			expect(boxesOverlap(new CFrame(), big, closer, small)).to.equal(true);
		});

		it("grows the first box by inflate on every side", () => {
			const size = new Vector3(2, 2, 2);
			const apart = new CFrame(0, 0, 2.5);
			expect(boxesOverlap(new CFrame(), size, apart, size, 0.4)).to.equal(false);
			expect(boxesOverlap(new CFrame(), size, apart, size, 0.6)).to.equal(true);
		});

		it("agrees with a full axis search on random boxes, including edge-only separations", () => {
			const random = seededRandom(7);
			let edgeSeparated = 0;
			let checked = 0;

			for (let index = 0; index < 600; index++) {
				const a = new CFrame(random() * 6 - 3, random() * 6 - 3, random() * 6 - 3).mul(
					CFrame.Angles(random() * 6.3, random() * 6.3, random() * 6.3),
				);
				const b = new CFrame(random() * 6 - 3, random() * 6 - 3, random() * 6 - 3).mul(
					CFrame.Angles(random() * 6.3, random() * 6.3, random() * 6.3),
				);
				const aSize = new Vector3(0.2 + random() * 4, 0.2 + random() * 4, 0.2 + random() * 4);
				const bSize = new Vector3(0.2 + random() * 4, 0.2 + random() * 4, 0.2 + random() * 4);

				const [gap, byEdge] = separation(a, aSize, b, bSize);
				if (math.abs(gap) < 1e-3) {
					continue;
				}

				checked++;
				if (byEdge) {
					edgeSeparated++;
				}
				expect(boxesOverlap(a, aSize, b, bSize)).to.equal(gap < 0);
			}

			expect(checked > 550).to.equal(true);
			expect(edgeSeparated > 0).to.equal(true);
		});
	});

	describe("sphereOverlapsBox", () => {
		const size = new Vector3(2, 2, 2);

		it("overlaps when the centre is inside the box", () => {
			expect(sphereOverlapsBox(new Vector3(0.5, 0.2, 0), 0.1, new CFrame(), size)).to.equal(true);
		});

		it("counts a sphere resting on a face", () => {
			expect(sphereOverlapsBox(new Vector3(0, 2, 0), 1, new CFrame(), size)).to.equal(true);
			expect(sphereOverlapsBox(new Vector3(0, 2.01, 0), 1, new CFrame(), size)).to.equal(false);
		});

		it("measures to the nearest corner, not the face planes", () => {
			const outside = new Vector3(2, 2, 2);
			expect(sphereOverlapsBox(outside, 1.7, new CFrame(), size)).to.equal(false);
			expect(sphereOverlapsBox(outside, 1.75, new CFrame(), size)).to.equal(true);
		});

		it("respects the box rotation", () => {
			const turned = CFrame.Angles(0, math.rad(45), 0);
			expect(sphereOverlapsBox(new Vector3(1.3, 0, 0), 0.05, turned, size)).to.equal(true);
			expect(sphereOverlapsBox(new Vector3(1.3, 0, 0), 0.05, new CFrame(), size)).to.equal(false);
		});
	});
};
