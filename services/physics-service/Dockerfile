FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY services/physics-service/go.mod services/physics-service/go.sum ./

RUN go mod download

COPY services/physics-service/ .

COPY shared/proto/ ./proto/

RUN CGO_ENABLED=0 GOOS=linux go build -o physics-service .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/physics-service .

EXPOSE 50051
CMD ["./physics-service"]