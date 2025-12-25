/**
 * Integration Tests for Command API Endpoint
 */

import { POST } from "@/app/api/devices/[deviceId]/command/route";
import { createClient } from "@/lib/supabase/server";

// Mock Supabase client
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

// Mock command validation
jest.mock("@/lib/utils/command-validation", () => ({
  validateCommand: jest.fn(),
}));

describe("POST /api/devices/[deviceId]/command", () => {
  const mockUser = {
    id: "user-123",
    email: "test@example.com",
  };

  const mockDevice = {
    id: "device-123",
    user_id: "user-123",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should reject unauthenticated requests", async () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn().resolvedValue({ data: { user: null }, error: null }),
      },
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);

    const request = new Request("http://localhost/api/devices/device-123/command", {
      method: "POST",
      body: JSON.stringify({ command: "getinfo" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ deviceId: "device-123" }),
    });

    expect(response.status).toBe(401);
  });

  it("should validate device ownership", async () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn().resolvedValue({ data: { user: mockUser }, error: null }),
      },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().resolvedValue({
              data: { id: "device-123", user_id: "other-user" },
              error: null,
            }),
          }),
        }),
      }),
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);

    const { validateCommand } = require("@/lib/utils/command-validation");
    validateCommand.mockImplementation(() => {});

    const request = new Request("http://localhost/api/devices/device-123/command", {
      method: "POST",
      body: JSON.stringify({ command: "getinfo" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ deviceId: "device-123" }),
    });

    expect(response.status).toBe(403);
  });

  it("should validate command against whitelist", async () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn().resolvedValue({ data: { user: mockUser }, error: null }),
      },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().resolvedValue({
              data: mockDevice,
              error: null,
            }),
          }),
        }),
      }),
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);

    const { validateCommand } = require("@/lib/utils/command-validation");
    validateCommand.mockImplementation(() => {
      throw new Error("Command not allowed");
    });

    const request = new Request("http://localhost/api/devices/device-123/command", {
      method: "POST",
      body: JSON.stringify({ command: "rm -rf /" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ deviceId: "device-123" }),
    });

    expect(response.status).toBe(400);
  });
});

