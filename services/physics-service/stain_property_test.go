package main

import (
	"math/rand"
	"testing"

	pb "coffee-canvas/physics-service/proto"
)

// TestStainDataPreservation_DeterministicMutations verifies that the same input always
// produces the exact same stroke mutations.
// Property 5: Stain Data Preservation (Requirements 2.4, 6.2)
func TestStainDataPreservation_DeterministicMutations(t *testing.T) {
	strokes := fixedStrokes()
	absorbedMap := map[string]float64{
		"stroke-A": 5.0,
		"stroke-B": 2.3,
	}

	result1 := ComputeStrokeMutations(strokes, absorbedMap)
	result2 := ComputeStrokeMutations(strokes, absorbedMap)

	if len(result1) != len(result2) {
		t.Fatalf("Determinism broken: different number of mutations (%d vs %d)",
			len(result1), len(result2))
	}
	for i := range result1 {
		m1, m2 := result1[i], result2[i]
		if m1.StrokeId != m2.StrokeId {
			t.Errorf("[%d] stroke_id mismatch: %s vs %s", i, m1.StrokeId, m2.StrokeId)
		}
		if m1.ColorShift != m2.ColorShift {
			t.Errorf("[%d] color_shift mismatch: %s vs %s", i, m1.ColorShift, m2.ColorShift)
		}
		if m1.BlurFactor != m2.BlurFactor {
			t.Errorf("[%d] blur_factor mismatch: %f vs %f", i, m1.BlurFactor, m2.BlurFactor)
		}
		if m1.OpacityDelta != m2.OpacityDelta {
			t.Errorf("[%d] opacity_delta mismatch: %f vs %f", i, m1.OpacityDelta, m2.OpacityDelta)
		}
	}
}

// TestStainDataPreservation_AllStrokeIdsPreserved verifies that mutations are only
// generated for strokes that actually appear in the nearby strokes list.
// Property 5: Stain Data Preservation
func TestStainDataPreservation_AllStrokeIdsPreserved(t *testing.T) {
	strokes := fixedStrokes()
	ids := map[string]bool{}
	for _, s := range strokes {
		ids[s.StrokeId] = true
	}

	absorbedMap := map[string]float64{
		"stroke-A": 3.0,
		"stroke-B": 1.5,
		"unknown":  9.0, // not in nearby strokes — must be ignored
	}

	mutations := ComputeStrokeMutations(strokes, absorbedMap)
	for _, m := range mutations {
		if !ids[m.StrokeId] {
			t.Errorf("Mutation references unknown stroke_id %q not in nearby strokes", m.StrokeId)
		}
	}
}

// TestStainDataPreservation_ZeroAbsorption verifies no mutation is produced for strokes
// with zero or negligible absorption.
func TestStainDataPreservation_ZeroAbsorption(t *testing.T) {
	strokes := fixedStrokes()
	absorbedMap := map[string]float64{
		"stroke-A": 0.0,
		"stroke-B": 0.0,
	}

	mutations := ComputeStrokeMutations(strokes, absorbedMap)
	if len(mutations) != 0 {
		t.Errorf("Expected no mutations for zero absorption, got %d", len(mutations))
	}
}

// TestStainDataPreservation_ColorShiftTowardsCoffee verifies that color interpolation
// shifts the stroke color toward the coffee brown (#6F4E37) when factor increases.
func TestStainDataPreservation_ColorShiftTowardsCoffee(t *testing.T) {
	// White stroke: #FFFFFF → should shift toward #6F4E37
	color0 := interpolateTowardsCoffee("#FFFFFF", 0.0)
	color1 := interpolateTowardsCoffee("#FFFFFF", 1.0)
	colorHalf := interpolateTowardsCoffee("#FFFFFF", 0.5)

	if color0 != "#FFFFFF" {
		t.Errorf("Factor 0 should return original color, got %s", color0)
	}
	if color1 != "#6F4E37" {
		t.Errorf("Factor 1 should return coffee color, got %s", color1)
	}

	// Half-way should have r in (0x6F, 0xFF)
	rHalf := hexByte(colorHalf[1:3])
	if rHalf <= 0x6F || rHalf >= 0xFF {
		t.Errorf("Half-way red channel %02X out of expected (0x6F, 0xFF)", rHalf)
	}
}

// TestStainDataPreservation_Randomized is a property test that generates random
// stroke sets and absorption maps, verifying that every mutation references a
// known nearby stroke and that blur/opacity deltas stay within valid ranges.
func TestStainDataPreservation_Randomized(t *testing.T) {
	rng := rand.New(rand.NewSource(99))
	const iterations = 100

	for i := 0; i < iterations; i++ {
		nStrokes := rng.Intn(8) + 1
		strokes := make([]*pb.StrokeSnapshot, nStrokes)
		knownIDs := make(map[string]bool)

		for j := 0; j < nStrokes; j++ {
			id := "stroke-" + string(rune('A'+j))
			strokes[j] = &pb.StrokeSnapshot{
				StrokeId: id,
				Color:    randomHex(rng),
				Width:    float32(rng.Intn(20) + 1),
				Opacity:  float32(rng.Float64()),
			}
			knownIDs[id] = true
		}

		absorbed := make(map[string]float64)
		for j := 0; j < nStrokes; j++ {
			id := "stroke-" + string(rune('A'+j))
			absorbed[id] = rng.Float64() * 15.0
		}

		mutations := ComputeStrokeMutations(strokes, absorbed)

		for _, m := range mutations {
			// All mutations must reference a known stroke
			if !knownIDs[m.StrokeId] {
				t.Errorf("Iter %d: mutation for unknown stroke_id %q", i, m.StrokeId)
			}
			// Blur factor must be in [0, 2.5]
			if m.BlurFactor < 0 || m.BlurFactor > 2.5 {
				t.Errorf("Iter %d: blur_factor %.4f out of [0,2.5]", i, m.BlurFactor)
			}
			// Opacity delta must be in [-0.1, 0]
			if m.OpacityDelta < -0.1 || m.OpacityDelta > 0 {
				t.Errorf("Iter %d: opacity_delta %.4f out of [-0.1, 0]", i, m.OpacityDelta)
			}
			// Color shift must be a valid hex color
			if len(m.ColorShift) != 7 || m.ColorShift[0] != '#' {
				t.Errorf("Iter %d: invalid color_shift format %q", i, m.ColorShift)
			}
		}
	}
}

// --- helpers ---

func fixedStrokes() []*pb.StrokeSnapshot {
	return []*pb.StrokeSnapshot{
		{
			StrokeId: "stroke-A",
			Color:    "#FF6600",
			Width:    4.0,
			Opacity:  0.9,
			Points:   []*pb.Point2D{{X: 0, Y: 0}, {X: 10, Y: 10}},
		},
		{
			StrokeId: "stroke-B",
			Color:    "#003399",
			Width:    8.0,
			Opacity:  0.7,
			Points:   []*pb.Point2D{{X: -5, Y: 5}, {X: 5, Y: -5}},
		},
	}
}
