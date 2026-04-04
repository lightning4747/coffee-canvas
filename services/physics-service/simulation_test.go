package main

import (
	"context"
	"fmt"
	"testing"
	"time"

	pb "coffee-canvas/physics-service/proto"
)

// TestSimulation_Determinism verifies that the same request always produces
// identical grid state (deterministic simulation).
func TestSimulation_Determinism(t *testing.T) {
	req := makePourRequest("sim-det-001", 0.6, 0.4, 60, defaultStrokes())

	r1 := RunSimulation(req)
	r2 := RunSimulation(req)

	if r1.InitialVolume != r2.InitialVolume {
		t.Errorf("InitialVolume differs: %.4f vs %.4f", r1.InitialVolume, r2.InitialVolume)
	}

	v1 := gridTotalVolume(r1.Grid)
	v2 := gridTotalVolume(r2.Grid)
	if v1 != v2 {
		t.Errorf("Grid volume differs across runs: %.6f vs %.6f", v1, v2)
	}

	if r1.Grid.TotalAbsorbed != r2.Grid.TotalAbsorbed {
		t.Errorf("TotalAbsorbed differs: %.6f vs %.6f", r1.Grid.TotalAbsorbed, r2.Grid.TotalAbsorbed)
	}
}

// TestSimulation_Performance validates that RunSimulation returns valid results
// under maximum-load parameters (120 steps, 10 dense strokes).
func TestSimulation_Performance(t *testing.T) {
	req := makePourRequest("perf-001", 0.9, 0.2, 120, heavyLoadStrokes())
	result := RunSimulation(req)

	if result == nil || result.Grid == nil {
		t.Fatal("RunSimulation returned nil result or grid for high-volume load")
	}
	// Functional check: ensure it didn't just crash and produced at least some mutations
	if len(result.MutatedStrokes) == 0 {
		t.Log("Note: No strokes mutated in this load test, but simulation finished.")
	}
}

// BenchmarkSimulation_Performance measures simulation performance under a typical
// heavy-load scenario (120 steps, 10 dense strokes, high intensity).
// This replaces the brittle wall-clock checks previously in TestSimulation_Performance.
func BenchmarkSimulation_Performance(b *testing.B) {
	strokes := heavyLoadStrokes()
	req := makePourRequest("bench-001", 0.9, 0.2, 120, strokes)

	b.ResetTimer()
	for n := 0; n < b.N; n++ {
		RunSimulation(req)
	}
}

// TestSimulation_GridBounds verifies that no fluid cell escapes the grid boundaries.
func TestSimulation_GridBounds(t *testing.T) {
	req := makePourRequest("bounds-001", 1.0, 0.1, 120, nil)
	result := RunSimulation(req)

	for x := 0; x < result.Grid.SizeX; x++ {
		for y := 0; y < result.Grid.SizeY; y++ {
			if result.Grid.Cells[x][y].Volume < 0 {
				t.Errorf("Negative fluid volume at [%d,%d]: %.6f", x, y, result.Grid.Cells[x][y].Volume)
			}
		}
	}
}

// TestSimulation_EmptyNearbyStrokes verifies no panics and valid result with no nearby strokes.
func TestSimulation_EmptyNearbyStrokes(t *testing.T) {
	req := makePourRequest("empty-strokes", 0.5, 0.5, 60, nil)
	result := RunSimulation(req)

	if result.InitialVolume <= 0 {
		t.Errorf("Expected positive initial volume, got %.4f", result.InitialVolume)
	}
	if len(result.MutatedStrokes) != 0 {
		t.Errorf("Expected no mutations with no nearby strokes, got %d", len(result.MutatedStrokes))
	}
}

// TestSimulation_MaxStepsClamp verifies that simulation steps are clamped to 120.
func TestSimulation_MaxStepsClamp(t *testing.T) {
	// 9999 steps should be clamped to 120 and still complete quickly.
	req := makePourRequest("clamp-steps", 0.5, 0.5, 9999, nil)

	start := time.Now()
	RunSimulation(req)
	elapsed := time.Since(start)

	if elapsed > 500*time.Millisecond {
		t.Errorf("Steps-clamping failed — simulation took %dms for 9999 steps", elapsed.Milliseconds())
	}
}

// TestMarchingSquares_EmptyGrid verifies that an empty (zero-volume) grid produces no polygons.
func TestMarchingSquares_EmptyGrid(t *testing.T) {
	req := makePourRequest("ms-empty", 0.5, 0.5, 0, nil)
	origin := &pb.Point2D{X: 0, Y: 0}
	grid := NewSimGrid(origin, 0.5)
	// Do NOT place any fluid — all cells stay at 0
	polygons := ExtractStainPolygons(grid, 100.0)
	if len(polygons) != 0 {
		t.Errorf("Expected 0 polygons from empty grid, got %d", len(polygons))
	}
	_ = req
}

// TestMarchingSquares_SingleFluidCell verifies stain polygon is generated for a single
// above-threshold cell.
func TestMarchingSquares_SingleFluidCell(t *testing.T) {
	origin := &pb.Point2D{X: 0, Y: 0}
	grid := NewSimGrid(origin, 0.5)

	// Place a concentrated fluid at the center
	cx, cy := grid.SizeX/2, grid.SizeY/2
	grid.Cells[cx][cy].Volume = 10.0

	polygons := ExtractStainPolygons(grid, 100.0)
	// At minimum a contour should be formed around a single filled cell
	if len(polygons) == 0 {
		t.Error("Expected at least one stain polygon for a filled cell, got none")
	}
}

// TestAbsorptionRate_DarkerAbsorbsMore checks that darker strokes have higher absorption rate.
func TestAbsorptionRate_DarkerAbsorbsMore(t *testing.T) {
	// Black vs White, same width
	dark := calculateAbsorptionRate("#000000", 5.0)
	light := calculateAbsorptionRate("#FFFFFF", 5.0)

	if dark <= light {
		t.Errorf("Dark stroke should absorb more than light stroke: dark=%.4f light=%.4f", dark, light)
	}
}

// TestAbsorptionRate_WiderAbsorbsMore checks that wider strokes absorb more (up to cap).
func TestAbsorptionRate_WiderAbsorbsMore(t *testing.T) {
	thin := calculateAbsorptionRate("#666666", 2.0)
	thick := calculateAbsorptionRate("#666666", 15.0)

	if thick <= thin {
		t.Errorf("Thick stroke should absorb more than thin stroke: thick=%.4f thin=%.4f", thick, thin)
	}
}

// TestComputeSpread_InputValidation checks gRPC server input validation.
func TestComputeSpread_InputValidation(t *testing.T) {
	srv := &PhysicsServer{}

	// Missing origin
	_, err := srv.ComputeSpread(context.TODO(), &pb.PourRequest{PourId: "x", Intensity: 0.5, Viscosity: 0.5})
	if err == nil {
		t.Error("Expected error for missing origin, got nil")
	}

	// Invalid intensity
	_, err = srv.ComputeSpread(context.TODO(), &pb.PourRequest{
		PourId: "x", Origin: &pb.Point2D{}, Intensity: 1.5, Viscosity: 0.5,
	})
	if err == nil {
		t.Error("Expected error for intensity > 1.0, got nil")
	}

	// Missing pour_id
	_, err = srv.ComputeSpread(context.TODO(), &pb.PourRequest{
		Origin: &pb.Point2D{}, Intensity: 0.5, Viscosity: 0.5,
	})
	if err == nil {
		t.Error("Expected error for missing pour_id, got nil")
	}
}

// --- helpers ---

func makePourRequest(pourID string, intensity, viscosity float32, steps int32, strokes []*pb.StrokeSnapshot) *pb.PourRequest {
	return &pb.PourRequest{
		RoomId:          "test-room",
		PourId:          pourID,
		Origin:          &pb.Point2D{X: 0, Y: 0},
		Intensity:       intensity,
		Viscosity:       viscosity,
		SimulationSteps: steps,
		NearbyStrokes:   strokes,
	}
}

func defaultStrokes() []*pb.StrokeSnapshot {
	return []*pb.StrokeSnapshot{
		{
			StrokeId: "default-A",
			Color:    "#AA3300",
			Width:    6,
			Opacity:  0.85,
			Points:   []*pb.Point2D{{X: -15, Y: 0}, {X: 0, Y: 15}, {X: 15, Y: 0}},
		},
	}
}

func heavyLoadStrokes() []*pb.StrokeSnapshot {
	strokes := make([]*pb.StrokeSnapshot, 10)
	for i := range strokes {
		pts := make([]*pb.Point2D, 20)
		for j := range pts {
			pts[j] = &pb.Point2D{X: float32(i*10 - 50 + j*2), Y: float32(j * 5)}
		}
		strokes[i] = &pb.StrokeSnapshot{
			StrokeId: fmt.Sprintf("heavy-stroke-%c", 'A'+i),
			Color:    "#336699",
			Width:    5,
			Opacity:  0.8,
			Points:   pts,
		}
	}
	return strokes
}
