package main

import (
	"context"
	"log"
	"math"
	"time"

	pb "coffee-canvas/physics-service/proto"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// PhysicsServer implements the CoffeePhysicsServer gRPC interface defined in the protobuf.
// It serves as the primary gateway for the Canvas Service to request simulations.
type PhysicsServer struct {
	pb.UnimplementedCoffeePhysicsServer
}

// ComputeSpread handles a coffee pour simulation request via gRPC.
// It performs strict input validation, executes the fluid simulation engine,
// extracts visual geometry (stain polygons) using the marching squares algorithm,
// and determines how existing strokes should be mutated by the fluid.
//
// @param ctx - gRPC context for request cancellation/deadlines.
// @param req - The pour request containing origin, intensity, and nearby geometry.
// @returns A StainResult containing polygons and mutations, or an error if validation fails.
func (s *PhysicsServer) ComputeSpread(ctx context.Context, req *pb.PourRequest) (*pb.StainResult, error) {
	start := time.Now()

	// --- Input Validation ---
	if req.Origin == nil {
		return nil, status.Error(codes.InvalidArgument, "origin is required")
	}
	isFiniteUnitFloat := func(v float32) bool {
		f := float64(v)
		return !math.IsNaN(f) && !math.IsInf(f, 0) && v >= 0 && v <= 1
	}
	if !isFiniteUnitFloat(req.Intensity) {
		return nil, status.Errorf(codes.InvalidArgument, "intensity must be between 0.0 and 1.0, got %f", req.Intensity)
	}
	if !isFiniteUnitFloat(req.Viscosity) {
		return nil, status.Errorf(codes.InvalidArgument, "viscosity must be between 0.0 and 1.0, got %f", req.Viscosity)
	}
	if req.PourId == "" {
		return nil, status.Error(codes.InvalidArgument, "pour_id is required")
	}
	for i, stroke := range req.NearbyStrokes {
		if stroke == nil || math.IsNaN(float64(stroke.Width)) || math.IsInf(float64(stroke.Width), 0) || stroke.Width < 0 {
			return nil, status.Errorf(codes.InvalidArgument, "nearby_strokes[%d].width must be finite and >= 0", i)
		}
	}

	log.Printf("[physics] ComputeSpread pour_id=%s room_id=%s intensity=%.2f strokes=%d steps=%d",
		req.PourId, req.RoomId, req.Intensity, len(req.NearbyStrokes), req.SimulationSteps)

	// --- Run Fluid Simulation ---
	simResult := RunSimulation(req)

	// --- Extract Stain Polygons ---
	// Converts the cell volumes into visual polygons for the frontend.
	stainPolygons := ExtractStainPolygons(simResult.Grid, simResult.InitialVolume)

	// --- Compute Stroke Mutations ---
	// Maps the volume absorbed by each stroke cell back to per-stroke effects.
	strokeMutations := ComputeStrokeMutations(req.NearbyStrokes, simResult.MutatedStrokes)

	elapsed := time.Since(start)
	computationMs := int32(elapsed.Milliseconds())

	log.Printf("[physics] ComputeSpread done pour_id=%s polygons=%d mutations=%d elapsed=%dms",
		req.PourId, len(stainPolygons), len(strokeMutations), computationMs)

	return &pb.StainResult{
		PourId:          req.PourId,
		StainPolygons:   stainPolygons,
		StrokeMutations: strokeMutations,
		ComputationMs:   computationMs,
	}, nil
}
