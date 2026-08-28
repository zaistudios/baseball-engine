# Autopsy harness — NOT part of the prototype. Added 2026-08-11 to test the
# three documented faults against the real GDScript, after removing the
# misplaced GameField block from GameManager.gd.
#
# Run: godot --headless --path . --script autopsy_harness.gd
extends SceneTree

const SWING_HITBOX_START = 0.15  # playercontroller.gd:185
const SWING_HITBOX_END = 0.35    # bat hitbox lifetime
const TARGET = 0.2               # playercontroller.gd:212

func _initialize() -> void:
	var hc := HitCalculator.new()

	print("\n================ FAULT 3: the missing 'miss' table ================")
	print("hit_outcome_tables keys: %s" % [hc.hit_outcome_tables.keys()])
	print("has('miss'): %s\n" % hc.hit_outcome_tables.has("miss"))

	# Sweep the whole window the bat hitbox can actually make contact in.
	var crash_from := -1.0
	var steps := 0
	var crashes := 0
	var d := SWING_HITBOX_START
	while d <= SWING_HITBOX_END + 0.0001:
		var timing_difference: float = d - TARGET
		var quality: String = hc.get_timing_quality_with_contact(timing_difference, 1.0)
		var would_crash: bool = not hc.hit_outcome_tables.has(quality)
		steps += 1
		if would_crash:
			crashes += 1
			if crash_from < 0.0:
				crash_from = d
		print("  contact at %.2fs  ->  timing_difference %+.3f  ->  %-7s  %s" % [
			d, timing_difference, quality, "CRASH" if would_crash else "ok"
		])
		d += 0.01

	print("\n  first crashing contact time: %.2fs" % crash_from)
	print("  crashing samples: %d of %d  (%.0f%% of the contact window)" % [
		crashes, steps, 100.0 * float(crashes) / float(steps)
	])

	print("\n================ FAULT 1: early graded as late ================")
	# The grader itself is consistent with the SIGN it is handed. The inversion
	# is in what swing_duration MEANS, so the test has to be driven from the
	# press, not from the duration.
	#
	# Ball arrives at a fixed moment. swing_duration = arrival - press_time.
	# Press EARLY -> the ball is still far away -> duration is LONGER
	#             -> timing_difference = duration - 0.2 goes POSITIVE -> "late".
	var ball_arrives := 1.0
	print("  ball arrives at t=%.2f, bat swings for 0.2s by design\n" % ball_arrives)
	for press_time in [0.75, 0.80, 0.85]:
		var swing_duration: float = ball_arrives - press_time
		var td: float = swing_duration - TARGET
		var truth: String = "EARLY" if press_time < 0.80 else ("LATE" if press_time > 0.80 else "on time")
		var graded: String = hc.get_timing_quality_with_contact(td, 1.0)
		var verdict: String = "<-- INVERTED" if (truth == "EARLY" and graded == "late") or (truth == "LATE" and graded == "early") else ""
		print("  press t=%.2f (%-7s) -> duration %.2fs -> timing_difference %+.3f -> graded '%s'  %s" % [
			press_time, truth, swing_duration, td, graded, verdict
		])

	print("\n================ FAULT 2: window vs instrument ================")
	var tick := 1.0 / 60.0
	print("  PERFECT_WINDOW = %.4fs, one 60Hz physics tick = %.4fs" % [hc.PERFECT_WINDOW, tick])
	print("  perfect window is %.2f ticks wide -> unreachable by construction" % ((hc.PERFECT_WINDOW * 2.0) / tick))

	print("\n================ THE UNGUARDED CALL ================")
	print("Calling calculate_hit() with a swing that grades 'miss' (contact at 0.30s):")
	var fatal := hc.calculate_hit(0.30 - TARGET, "fastball", Vector2(320, 240), Vector2(320, 300))
	print("  returned: %s   <- this line should NOT be reached" % [fatal])

	quit()
