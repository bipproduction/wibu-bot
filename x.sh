curl -X POST http://localhost:3150/api/file \
     -H "Content-Type: multipart/form-data" \
     -F "file=@./README.md"