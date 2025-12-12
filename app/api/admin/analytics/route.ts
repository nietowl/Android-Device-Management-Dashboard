import { requireAdmin } from "@/lib/admin/utils";
import { NextResponse } from "next/server";
import { createErrorResponse, ApiErrors } from "@/lib/api/error-handler";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30"; // days

    // Validate period parameter
    const periodDays = parseInt(period);
    if (isNaN(periodDays) || periodDays < 1 || periodDays > 365) {
      throw ApiErrors.validationError("Period must be a number between 1 and 365 days");
    }

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (usersError) {
      throw ApiErrors.internalServerError(
        `Failed to fetch users: ${usersError.message}`,
        { databaseError: usersError }
      );
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - periodDays);

    // Calculate user growth over time
    const userGrowth = [];
    for (let i = periodDays; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const count = users?.filter((u) => {
        const userDate = new Date(u.created_at);
        userDate.setHours(0, 0, 0, 0);
        return userDate <= date;
      }).length || 0;

      userGrowth.push({
        date: date.toISOString().split("T")[0],
        count,
      });
    }

    // Calculate subscription conversion
    const conversions = {
      trial_to_active: users?.filter(
        (u) => u.subscription_status === "active" && u.subscription_start_date
      ).length || 0,
      total_trials: users?.filter((u) => u.subscription_status === "trial").length || 0,
      total_active: users?.filter((u) => u.subscription_status === "active").length || 0,
      total_expired: users?.filter((u) => u.subscription_status === "expired").length || 0,
    };

    // Calculate revenue metrics (mock - you'd integrate with payment provider)
    const revenueMetrics = {
      mrr: users?.reduce((sum, u) => {
        if (u.subscription_status === "active") {
          const tierPricing: Record<string, number> = {
            free: 0,
            basic: 9.99,
            premium: 29.99,
            enterprise: 99.99,
          };
          return sum + (tierPricing[u.subscription_tier] || 0);
        }
        return sum;
      }, 0) || 0,
      arr: 0,
      by_tier: {
        free: users?.filter((u) => u.subscription_tier === "free").length || 0,
        basic: users?.filter((u) => u.subscription_tier === "basic").length || 0,
        premium: users?.filter((u) => u.subscription_tier === "premium").length || 0,
        enterprise: users?.filter((u) => u.subscription_tier === "enterprise").length || 0,
      },
    };
    revenueMetrics.arr = revenueMetrics.mrr * 12;

    // Recent signups
    const recentSignups = users
      ?.filter((u) => new Date(u.created_at) >= cutoffDate)
      .slice(0, 10)
      .map((u) => ({
        email: u.email,
        date: u.created_at,
        tier: u.subscription_tier,
        status: u.subscription_status,
      })) || [];

    // Subscription status breakdown
    const statusBreakdown = {
      active: users?.filter((u) => u.subscription_status === "active").length || 0,
      trial: users?.filter((u) => u.subscription_status === "trial").length || 0,
      expired: users?.filter((u) => u.subscription_status === "expired").length || 0,
      cancelled: users?.filter((u) => u.subscription_status === "cancelled").length || 0,
    };

    return NextResponse.json({
      userGrowth,
      conversions,
      revenueMetrics,
      recentSignups,
      statusBreakdown,
      totalUsers: users?.length || 0,
    });
  } catch (error) {
    return createErrorResponse(error, "Failed to fetch analytics");
  }
}

