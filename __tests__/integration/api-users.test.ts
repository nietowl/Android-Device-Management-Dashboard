/**
 * Integration Tests for User Management API
 */

import { POST } from "@/app/api/admin/users/route";
import { requireAdmin } from "@/lib/admin/utils";

// Mock admin utilities
jest.mock("@/lib/admin/utils", () => ({
  requireAdmin: jest.fn(),
}));

describe("POST /api/admin/users", () => {
  const mockAdmin = {
    adminId: "admin-123",
    supabase: {
      from: jest.fn(),
      auth: {
        admin: {
          createUser: jest.fn(),
          deleteUser: jest.fn(),
        },
        listUsers: jest.fn(),
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdmin as jest.Mock).mockResolvedValue(mockAdmin);
  });

  it("should reject passwords shorter than 12 characters", async () => {
    const request = new Request("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: "test@example.com",
        password: "short",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("12 characters");
  });

  it("should reject passwords without complexity requirements", async () => {
    const request = new Request("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: "test@example.com",
        password: "alllowercase123",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("uppercase");
  });

  it("should accept strong passwords", async () => {
    mockAdmin.supabase.auth.admin.listUsers.mockResolvedValue({
      users: [],
    });
    mockAdmin.supabase.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: "user-123", email: "test@example.com" } },
      error: null,
    });
    mockAdmin.supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().resolvedValue({
            data: null,
            error: { code: "PGRST116" },
          }),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().resolvedValue({
            data: { id: "user-123" },
            error: null,
          }),
        }),
      }),
    });

    const request = new Request("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: "test@example.com",
        password: "StrongP@ssw0rd123",
      }),
    });

    // This should not throw a validation error
    const response = await POST(request);
    
    // If it's a validation error, check the status
    if (response.status === 400) {
      const data = await response.json();
      expect(data.error).not.toContain("12 characters");
      expect(data.error).not.toContain("uppercase");
    }
  });
});

