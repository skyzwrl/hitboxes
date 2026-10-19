/// <reference types="@rbxts/testez/globals" />

import { HitResult, SwingRejection } from "../messages";
import { box } from "../shapes";
import { defineSwing, phase } from "../swing";
import { Arena, JAB, dummy, moveTo } from "./fixtures";

function connect(arena: Arena) {
	const transport = arena.loopback.client(arena.player);
	const results = new Array<HitResult>();
	const rejections = new Array<SwingRejection>();
	transport.onHitResult((result) => results.push(result));
	transport.onSwingRejection((rejection) => rejections.push(rejection));

	return {
		results,
		rejections,
		swing(id: number, swing = "jab", time = arena.now) {
			transport.sendSwing({ id, swing, time });
			arena.loopback.flush();
		},
		claim(id: number, target: Model, time: number, phaseIndex = 0) {
			transport.sendClaim({ id, target, phase: phaseIndex, time });
			arena.loopback.flush();
		},
	};
}

export = () => {
	describe("claims", () => {
		it("accepts a hit that lines up at the claimed time", () => {
			const arena = new Arena();
			const client = connect(arena);

			arena.advance(0);
			client.swing(1);
			arena.advance(0.15);
			client.claim(1, arena.target, 0.15);

			expect(client.results.size()).to.equal(1);
			expect(client.results[0].accepted).to.equal(true);
			expect(arena.hits.join(",")).to.equal("Target:jab:0");
		});

		it("rewinds the target to where the attacker saw it", () => {
			const arena = new Arena();
			const client = connect(arena);

			arena.advance(0);
			client.swing(1);
			arena.advance(0.15);
			moveTo(arena.target, new CFrame(0, 0, -40));
			arena.advance(0.05);
			client.claim(1, arena.target, 0.15);

			expect(client.results[0].accepted).to.equal(true);
		});

		it("rewinds by the attacker's view delay on top of the claim time", () => {
			const delayed = new Arena({ viewDelay: () => 0.1 });
			const undelayed = new Arena();

			for (const arena of [delayed, undelayed]) {
				const client = connect(arena);
				arena.advance(0);
				client.swing(1);
				arena.advance(0.15);
				moveTo(arena.target, new CFrame(0, 0, -40));
				arena.advance(0.05);
				client.claim(1, arena.target, 0.25);
			}

			expect(delayed.hits.size()).to.equal(1);
			expect(undelayed.hits.size()).to.equal(0);
		});

		it("never rewinds further than maxRewind", () => {
			const moved = new Arena();
			const still = new Arena();

			for (const arena of [moved, still]) {
				const client = connect(arena);
				arena.advance(0);
				client.swing(1);
				arena.advance(0.15);
				if (arena === moved) {
					moveTo(arena.target, new CFrame(0, 0, -9));
				}
				for (let frame = 0; frame < 9; frame++) {
					arena.advance(0.05);
				}
				// arrives 0.45s late, so it is judged at now - 0.25 instead of 0.15
				client.claim(1, arena.target, 0.15);
			}

			expect(moved.hits.size()).to.equal(0);
			expect(still.hits.size()).to.equal(1);
		});

		it("gives fast swings the same between-frame sweep the client uses", () => {
			const dash = defineSwing({
				duration: 0.5,
				phases: [phase(box(new Vector3(1, 1, 1), new CFrame(0, 0, -1)), 0, 0.5)],
			});
			const arena = new Arena({ swings: { dash } });
			const client = connect(arena);
			moveTo(arena.target, new CFrame());
			moveTo(arena.attacker, new CFrame(0, 0, 6));

			arena.advance(0);
			client.swing(1, "dash");
			moveTo(arena.attacker, new CFrame(0, 0, -6));
			arena.advance(1 / 30);
			client.claim(1, arena.target, 1 / 60);

			expect(client.results[0].accepted).to.equal(true);
		});

		it("rejects targets out of reach", () => {
			const arena = new Arena();
			const client = connect(arena);
			moveTo(arena.target, new CFrame(0, 0, -30));

			arena.advance(0);
			client.swing(1);
			arena.advance(0.15);
			client.claim(1, arena.target, 0.15);

			expect(client.results[0].reason).to.equal("OutOfRange");
		});

		it("rejects targets in reach that the shape never touched", () => {
			const arena = new Arena();
			const client = connect(arena);
			moveTo(arena.target, new CFrame(0, 0, 5));

			arena.advance(0);
			client.swing(1);
			arena.advance(0.15);
			client.claim(1, arena.target, 0.15);

			expect(client.results[0].reason).to.equal("NoOverlap");
		});

		it("rejects a second hit on the same target in one swing", () => {
			const arena = new Arena();
			const client = connect(arena);

			arena.advance(0);
			client.swing(1);
			arena.advance(0.15);
			client.claim(1, arena.target, 0.15);
			arena.advance(0.05);
			client.claim(1, arena.target, 0.2);

			expect(client.results[1].reason).to.equal("Duplicate");
			expect(arena.hits.size()).to.equal(1);
		});

		it("rejects claims outside the phase window or for phases that don't exist", () => {
			const arena = new Arena();
			const client = connect(arena);

			arena.advance(0);
			client.swing(1);
			arena.advance(0.5);
			client.claim(1, arena.target, 0.45);
			client.claim(1, arena.target, 0.15, 3);

			expect(client.results[0].reason).to.equal("OutsideWindow");
			expect(client.results[1].reason).to.equal("OutsideWindow");
		});

		it("rejects claims stamped in the future", () => {
			const arena = new Arena();
			const client = connect(arena);

			arena.advance(0);
			client.swing(1);
			arena.advance(0.1);
			client.claim(1, arena.target, 0.25);

			expect(client.results[0].reason).to.equal("FutureTimestamp");
		});

		it("rejects hitting yourself and targets it isn't tracking", () => {
			const arena = new Arena();
			const client = connect(arena);
			const stranger = dummy("Stranger", new CFrame(0, 0, -4));

			arena.advance(0);
			client.swing(1);
			arena.advance(0.15);
			client.claim(1, arena.attacker, 0.15);
			client.claim(1, stranger, 0.15);

			expect(client.results[0].reason).to.equal("SelfHit");
			expect(client.results[1].reason).to.equal("UnknownTarget");
		});

		it("rejects claims for swings it never accepted", () => {
			const arena = new Arena();
			const client = connect(arena);

			arena.advance(0.15);
			client.claim(99, arena.target, 0.15);

			expect(client.results[0].reason).to.equal("UnknownSwing");
		});

		it("stops at maxTargets", () => {
			const single = defineSwing({ duration: 0.5, phases: JAB.phases, maxTargets: 1 });
			const arena = new Arena({ swings: { jab: single } });
			const client = connect(arena);
			const second = dummy("Second", new CFrame(1, 0, -4));
			arena.server.track(second);

			arena.advance(0);
			client.swing(1);
			arena.advance(0.15);
			client.claim(1, arena.target, 0.15);
			client.claim(1, second, 0.15);

			expect(client.results[0].accepted).to.equal(true);
			expect(client.results[1].reason).to.equal("TooManyTargets");
		});
	});

	describe("swings", () => {
		it("rejects unknown swings, reused ids and swings stamped in the future", () => {
			const arena = new Arena();
			const client = connect(arena);

			arena.advance(1);
			client.swing(1, "uppercut");
			client.swing(1);
			client.swing(1);
			client.swing(5, "jab", 2);

			expect(client.rejections.size()).to.equal(3);
			expect(client.rejections[0].reason).to.equal("UnknownSwing");
			expect(client.rejections[1].reason).to.equal("StaleSwing");
			expect(client.rejections[2].reason).to.equal("FutureTimestamp");
		});

		it("rejects a swing that starts before the last one finished", () => {
			const arena = new Arena();
			const client = connect(arena);

			arena.advance(0);
			client.swing(1);
			arena.advance(0.2);
			client.swing(2);
			arena.advance(0.3);
			client.swing(3);

			expect(client.rejections.size()).to.equal(1);
			expect(client.rejections[0].id).to.equal(2);
		});

		it("can't stretch its windows by backdating the swing", () => {
			const arena = new Arena();
			const client = connect(arena);

			arena.advance(1);
			client.swing(1, "jab", 0);
			arena.advance(0.05);
			// 0.15s in against the claimed start, but well before the window against the clamped one
			client.claim(1, arena.target, 0.15);

			expect(client.results[0].reason).to.equal("OutsideWindow");
		});

		it("forgets a player's swings", () => {
			const arena = new Arena();
			const client = connect(arena);

			arena.advance(0);
			client.swing(1);
			arena.server.forget(arena.player);
			arena.advance(0.15);
			client.claim(1, arena.target, 0.15);
			client.swing(1);

			expect(client.results[0].reason).to.equal("UnknownSwing");
			expect(client.rejections.size()).to.equal(0);
		});
	});

	describe("lifecycle", () => {
		it("disconnects from the frame and transport on destroy", () => {
			const arena = new Arena();
			const client = connect(arena);
			expect(arena.frame.listenerCount()).to.equal(1);

			arena.server.destroy();
			expect(arena.frame.listenerCount()).to.equal(0);

			client.swing(1);
			expect(client.rejections.size()).to.equal(0);
			expect(arena.server.isTracked(arena.target)).to.equal(false);
		});
	});
};
