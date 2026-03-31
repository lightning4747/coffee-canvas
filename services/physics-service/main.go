package main

import (
	"fmt"
	"log"
	"net"
	"os"

	"google.golang.org/grpc"
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
	
	// TODO: Register Physics Service implementation
	// This will be implemented in later tasks

	fmt.Printf("Physics Service listening on port %s\n", port)
	
	if err := s.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}