import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("time tracking workflow", () => {
  it("registers a user and tracks reportable time", async () => {
    const app = createApp(":memory:");

    const signup = await request(app).post("/api/auth/register").send({
      name: "Alyson Tester",
      email: "alyson@example.com",
      password: "password123",
    });
    expect(signup.status).toBe(201);
    const token = signup.body.token;

    const client = await request(app)
      .post("/api/projects/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Acme Co" });
    expect(client.status).toBe(201);

    const project = await request(app)
      .post("/api/projects/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Design system refresh", clientId: client.body.client.id, billable: true });
    expect(project.status).toBe(201);

    const started = await request(app)
      .post("/api/time-entries/timer/start")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: project.body.project.id,
        clientId: client.body.client.id,
        description: "Component audit",
        tags: ["design"],
        billable: true,
        startTime: "2026-04-28T09:00:00.000Z",
      });
    expect(started.status).toBe(201);
    expect(started.body.entry.end_time).toBeNull();

    const stopped = await request(app)
      .post("/api/time-entries/timer/stop")
      .set("Authorization", `Bearer ${token}`)
      .send({ endTime: "2026-04-28T10:30:00.000Z", idleSeconds: 300 });
    expect(stopped.status).toBe(200);
    expect(stopped.body.entry.duration_seconds).toBe(5100);

    const dashboard = await request(app)
      .get("/api/reports/dashboard?date=2026-04-28")
      .set("Authorization", `Bearer ${token}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.trackedSeconds).toBe(5100);
    expect(dashboard.body.idleSeconds).toBe(300);

    const csv = await request(app)
      .get("/api/reports/export.csv?from=2026-04-28T00:00:00.000Z&to=2026-04-28T23:59:59.999Z")
      .set("Authorization", `Bearer ${token}`);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("Component audit");
  });
});
