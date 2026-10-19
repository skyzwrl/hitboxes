/// <reference types="@rbxts/testez/globals" />

import { PoseHistory } from "../pose-history";
import { seededRandom } from "./fixtures";

function at(x: number): CFrame {
	return new CFrame(x, 0, 0);
}

export = () => {
	describe("PoseHistory", () => {
		it("returns samples at their exact timestamps", () => {
			const history = new PoseHistory(8);
			history.push(1, at(10));
			history.push(2, at(20));
			history.push(3, at(30));

			expect(history.sample(1)!.X).to.equal(10);
			expect(history.sample(2)!.X).to.equal(20);
			expect(history.sample(3)!.X).to.equal(30);
		});

		it("interpolates between the samples around a time", () => {
			const history = new PoseHistory(8);
			history.push(0, at(0));
			history.push(1, at(10));
			history.push(3, at(30));

			expect(history.sample(0.25)!.X).to.be.near(2.5, 1e-6);
			expect(history.sample(2)!.X).to.be.near(20, 1e-6);
		});

		it("returns nothing outside the recorded window", () => {
			const history = new PoseHistory(8);
			expect(history.sample(0)).never.to.be.ok();

			history.push(1, at(10));
			history.push(2, at(20));
			expect(history.sample(0.99)).never.to.be.ok();
			expect(history.sample(2.01)).never.to.be.ok();
		});

		it("snaps to the nearest end with sampleClamped", () => {
			const history = new PoseHistory(8);
			history.push(1, at(10));
			history.push(2, at(20));

			expect(history.sampleClamped(-5)!.X).to.equal(10);
			expect(history.sampleClamped(9)!.X).to.equal(20);
		});

		it("keeps only the newest samples once full", () => {
			const history = new PoseHistory(4);
			for (let time = 0; time < 6; time++) {
				history.push(time, at(time * 10));
			}

			expect(history.size()).to.equal(4);
			expect(history.oldestTime()).to.equal(2);
			expect(history.newestTime()).to.equal(5);
			expect(history.latest()!.X).to.equal(50);
			expect(history.sample(1)).never.to.be.ok();
			expect(history.sample(2.5)!.X).to.be.near(25, 1e-6);
		});

		it("drops samples older than the newest and replaces ones at the same time", () => {
			const history = new PoseHistory(4);
			history.push(1, at(10));
			history.push(2, at(20));
			history.push(1.5, at(999));
			history.push(2, at(25));

			expect(history.size()).to.equal(2);
			expect(history.sample(1.5)!.X).to.be.near(17.5, 1e-6);
			expect(history.latest()!.X).to.equal(25);
		});

		it("agrees with a linear scan after wrapping around", () => {
			const random = seededRandom(42);
			const history = new PoseHistory(32);
			const times = new Array<number>();
			const xs = new Array<number>();

			let time = 0;
			for (let index = 0; index < 50; index++) {
				time += 0.01 + random() * 0.05;
				const x = random() * 100;
				history.push(time, at(x));
				times.push(time);
				xs.push(x);
			}

			const first = times.size() - 32;
			for (let check = 0; check < 200; check++) {
				const query = times[first] + random() * (times[times.size() - 1] - times[first]);

				let expected = xs[times.size() - 1];
				for (let index = first; index < times.size() - 1; index++) {
					if (query >= times[index] && query <= times[index + 1]) {
						const alpha = (query - times[index]) / (times[index + 1] - times[index]);
						expected = xs[index] + (xs[index + 1] - xs[index]) * alpha;
						break;
					}
				}

				// cframe positions are stored as float32, same as in roblox
				expect(history.sample(query)!.X).to.be.near(expected, 1e-3);
			}
		});

		it("forgets everything on clear", () => {
			const history = new PoseHistory(4);
			history.push(1, at(10));
			history.clear();

			expect(history.size()).to.equal(0);
			expect(history.latest()).never.to.be.ok();
			history.push(0.5, at(5));
			expect(history.sample(0.5)!.X).to.equal(5);
		});
	});
};
