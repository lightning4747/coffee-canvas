package main

import (
	"math/rand"
	"testing"

	pb "coffee-canvas/physics-service/proto"
)

// TestVolumeConservation_BasicPour verifies that the total fluid volume after
// simulation (remaining + absorbed) never exceeds the initial pour volume.
// Property 4: Physics Volume Conservation (Requirements 2.2, 2.5)
func TestVolumeConservation_BasicPour(t *testing.T) {
	req := &pb.PourRequest{
		RoomId:          "room-test",
		PourId:          "pour-vol-001",
		Origin:          &pb.Point2D{X: 0, Y: 0},
		Intensity:       0.75,
		Viscosity:       0.5,
		SimulationSteps: 60,
		NearbyStrokes:   nil,
	}

	result := RunSimulation(req)
	remainingVolume := gridTotalVolume(result.Grid)
	totalVolume := remainingVolume + result.Grid.TotalAbsorbed

	if totalVolume > result.InitialVolume*1.001 { // 0.1% tolerance for float rounding
		t.Errorf("Volume conservation violated: initial=%.4f remaining=%.4f absorbed=%.4f total=%.4f",
			result.InitialVolume, remainingVolume, result.Grid.TotalAbsorbed, totalVolume)
	}
}

// TestVolumeConservation_WithStrokes verifies conservation when strokes absorb fluid.
func TestVolumeConservation_WithStrokes(t *testing.T) {
	strokes := []*pb.StrokeSnapshot{
		{
			StrokeId: "stroke-001",
			Color:    "#000000",
			Width:    5,
			Opacity:  1.0,
			Points: []*pb.Point2D{
				{X: -20, Y: -20},
				{X: -10, Y: -10},
				{X: 0, Y: 0},
				{X: 10, Y: 10},
				{X: 20, Y: 20},
			},
		},
	}

	req := &pb.PourRequest{
		RoomId:          "room-test",
		PourId:          "pour-vol-002",
		Origin:          &pb.Point2D{X: 0, Y: 0},
		Intensity:       0.8,
		Viscosity:       0.3,
		SimulationSteps: 80,
		NearbyStrokes:   strokes,
	}

	result := RunSimulation(req)
	remainingVolume := gridTotalVolume(result.Grid)
	totalVolume := remainingVolume + result.Grid.TotalAbsorbed

	if totalVolume > result.InitialVolume*1.001 {
		t.Errorf("Volume conservation violated with strokes: initial=%.4f remaining=%.4f absorbed=%.4f total=%.4f",
			result.InitialVolume, remainingVolume, result.Grid.TotalAbsorbed, totalVolume)
	}
}

// TestVolumeConservation_Randomized is a property test that runs many random
// pour configurations and checks volume conservation for each.
// Property 4: Physics Volume Conservation
func TestVolumeConservation_Randomized(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	const iterations = 100

	for i := 0; i < iterations; i++ {
		intensity := rng.Float32()*0.9 + 0.05         // [0.05, 0.95]
		viscosity := rng.Float32()                    // [0.0, 1.0]
		steps := rng.Intn(100) + 10                   // [10, 110]
		ox := (rng.Float64() - 0.5) * 100.0           // [-50, 50]
		oy := (rng.Float64() - 0.5) * 100.0

		// Generate random strokes around origin
		nStrokes := rng.Intn(5)
		strokes := make([]*pb.StrokeSnapshot, nStrokes)
		for j := 0; j < nStrokes; j++ {
			nPts := rng.Intn(5) + 2
			pts := make([]*pb.Point2D, nPts)
			for k := range pts {
				pts[k] = &pb.Point2D{
					X: float32(ox + (rng.Float64()-0.5)*40),
					Y: float32(oy + (rng.Float64()-0.5)*40),
				}
			}
			strokes[j] = &pb.StrokeSnapshot{
				StrokeId: "s" + string(rune('A'+j)),
				Color:    randomHex(rng),
				Width:    float32(rng.Intn(10) + 1),
				Opacity:  float32(rng.Float64()),
				Points:   pts,
			}
		}

		req := &pb.PourRequest{
			RoomId:          "room-prop",
			PourId:          "prop-pour",
			Origin:          &pb.Point2D{X: float32(ox), Y: float32(oy)},
			Intensity:       intensity,
			Viscosity:       viscosity,
			SimulationSteps: int32(steps),
			NearbyStrokes:   strokes,
		}

		result := RunSimulation(req)
		remaining := gridTotalVolume(result.Grid)
		total := remaining + result.Grid.TotalAbsorbed

		if total > result.InitialVolume*1.001 {
			t.Errorf("Iteration %d: volume conservation violated: initial=%.4f total=%.4f (remaining=%.4f absorbed=%.4f)",
				i, result.InitialVolume, total, remaining, result.Grid.TotalAbsorbed)
		}
	}
}

// TestVolumeConservation_ZeroIntensity checks that zero intensity produces no fluid volume.
func TestVolumeConservation_ZeroIntensity(t *testing.T) {
	req := &pb.PourRequest{
		RoomId:          "room-test",
		PourId:          "pour-zero",
		Origin:          &pb.Point2D{X: 0, Y: 0},
		Intensity:       0,
		Viscosity:       0.5,
		SimulationSteps: 30,
	}
	result := RunSimulation(req)
	if result.InitialVolume != 0 {
		t.Errorf("Expected zero initial volume for zero intensity, got %.4f", result.InitialVolume)
	}
}

// TestVolumeConservation_MaxIntensity checks that maximum intensity stays bounded.
func TestVolumeConservation_MaxIntensity(t *testing.T) {
	req := &pb.PourRequest{
		RoomId:          "room-test",
		PourId:          "pour-max",
		Origin:          &pb.Point2D{X: 0, Y: 0},
		Intensity:       1.0,
		Viscosity:       0.1,
		SimulationSteps: 120,
	}
	result := RunSimulation(req)
	remaining := gridTotalVolume(result.Grid)
	total := remaining + result.Grid.TotalAbsorbed

	if total > result.InitialVolume*1.001 {
		t.Errorf("Max intensity: volume exceeded: initial=%.4f total=%.4f", result.InitialVolume, total)
	}
}

// --- helpers ---

func gridTotalVolume(g *SimGrid) float64 {
	total := 0.0
	for x := 0; x < g.SizeX; x++ {
		for y := 0; y < g.SizeY; y++ {
			total += g.Cells[x][y].Volume
		}
	}
	return total
}

func randomHex(rng *rand.Rand) string {
	r := rng.Intn(256)
	gv := rng.Intn(256)
	b := rng.Intn(256)
	return "#" + byteHex(r) + byteHex(gv) + byteHex(b)
}

func byteHex(v int) string {
	const hex = "0123456789ABCDEF"
	return string([]byte{hex[v>>4], hex[v&0xF]})
}
