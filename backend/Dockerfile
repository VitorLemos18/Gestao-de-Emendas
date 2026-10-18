# Empacota o JAR produzido e verificado por ./mvnw verify.
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system emendas && useradd --system --gid emendas emendas
COPY target/emendas-backend-0.2.0.jar app.jar
USER emendas
EXPOSE 8000
ENTRYPOINT ["java","-jar","app.jar"]
