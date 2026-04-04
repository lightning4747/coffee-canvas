package main

import (
	"fmt"
	"log"
	"net"
	"os"

	pb "coffee-canvas/physics-service/proto"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "50051"
	}

	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterCoffeePhysicsServer(s, &PhysicsServer{})

	// Enable gRPC server reflection for tooling (e.g. grpcurl)
	reflection.Register(s)

	fmt.Printf("Physics Service listening on port %s\n", port)

	if err := s.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}