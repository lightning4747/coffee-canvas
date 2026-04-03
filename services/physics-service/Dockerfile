FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY services/physics-service/go.mod services/physics-service/go.sum ./

RUN go mod download

# Copy source code
COPY services/physics-service/ .


RUN CGO_ENABLED=0 GOOS=linux go build -o physics-service .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/physics-service .

EXPOSE 50051
CMD ["./physics-service"]