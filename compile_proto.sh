#!/bin/sh
set -e
apk add --no-cache protoc protobuf-dev

cd /tmp
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.33.0
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.3.0

export PATH=$PATH:/go/bin

cd /app/shared
protoc --go_out=../services/physics-service --go-grpc_out=../services/physics-service --proto_path=./proto ./proto/*.proto

echo "Done generating protos!"
