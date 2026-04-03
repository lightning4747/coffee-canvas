package main

import (
	"context"
	"log"
	"time"

	pb "coffee-canvas/physics-service/proto"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// PhysicsServer implements the CoffeePhysicsServer gRPC interface.
type PhysicsServer struct {
	pb.UnimplementedCoffeePhysicsServer
}

// ComputeSpread handles a coffee pour simulation request.
// It validates the input, runs the fluid simulation, extracts stain polygons
// via marching squares, and returns stroke mutations.
func (s *PhysicsServer) ComputeSpread(ctx context.Context, req *pb.PourRequest) (*pb.StainResult, error) {
	start := time.Now()

	// --- Input Validation ---
	if req.Origin == nil {
		return nil, status.Error(codes.InvalidArgument, "origin is required")
	}
	if req.Intensity < 0 || req.Intensity > 1 {
		return nil, status.Errorf(codes.InvalidArgument, "intensity must be between 0.0 and 1.0, got %f", req.Intensity)
	}
	if req.Viscosity < 0 || req.Viscosity > 1 {
		return nil, status.Errorf(codes.InvalidArgument, "viscosity must be between 0.0 and 1.0, got %f", req.Viscosity)
	}
	if req.PourId == "" {
		return nil, status.Error(codes.InvalidArgument, "pour_id is required")
	}

	log.Printf("[physics] ComputeSpread pour_id=%s room_id=%s intensity=%.2f strokes=%d steps=%d",
		req.PourId, req.RoomId, req.Intensity, len(req.NearbyStrokes), req.SimulationSteps)

	// --- Run Fluid Simulation ---
	simResult := RunSimulation(req)

	// --- Extract Stain Polygons ---
	stainPolygons := ExtractStainPolygons(simResult.Grid, simResult.InitialVolume)

	// --- Compute Stroke Mutations ---
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
