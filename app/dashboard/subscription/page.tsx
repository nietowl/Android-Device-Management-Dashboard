"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CreditCard, Check, X, Calendar, Zap } from "lucide-react";
import { format } from "date-fns";
import { getUserProfileClient } from "@/lib/admin/client";
import { UserProfile } from "@/types";

export default function SubscriptionPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const userProfile = await getUserProfileClient();
    setProfile(userProfile);
    setLoading(false);
  };

  const getDaysRemaining = (endDate: string | null) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "$0",
      period: "forever",
      features: ["1 device", "Basic features", "Community support"],
      current: profile?.subscription_tier === "free",
    },
    {
      id: "basic",
      name: "Basic",
      price: "$9.99",
      period: "per month",
      features: ["5 devices", "All features", "Email support", "Priority updates"],
      current: profile?.subscription_tier === "basic",
    },
    {
      id: "premium",
      name: "Premium",
      price: "$29.99",
      period: "per month",
      features: [
        "Unlimited devices",
        "All features",
        "Priority support",
        "Advanced analytics",
        "API access",
      ],
      current: profile?.subscription_tier === "premium",
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "Custom",
      period: "",
      features: [
        "Unlimited devices",
        "All features",
        "Dedicated support",
        "Custom integrations",
        "SLA guarantee",
      ],
      current: profile?.subscription_tier === "enterprise",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const daysRemaining = getDaysRemaining(profile?.subscription_end_date || null);
  const isExpired = daysRemaining !== null && daysRemaining <= 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Subscription</h1>
            <p className="text-muted-foreground mt-1">
              Manage your subscription and billing
            </p>
          </div>
        </div>

        {/* Current Plan */}
        {profile && (
          <Card className="border-l-4 border-l-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Current Plan
                    <Badge
                      variant={
                        profile.subscription_status === "active"
                          ? "success"
                          : profile.subscription_status === "trial"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {profile.subscription_status}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {profile.subscription_tier.charAt(0).toUpperCase() +
                      profile.subscription_tier.slice(1)}{" "}
                    Plan
                  </CardDescription>
                </div>
                <div className="text-right">
                  {profile.subscription_end_date && (
                    <>
                      <p className="text-sm text-muted-foreground">Expires</p>
                      <p className="text-lg font-semibold">
                        {format(new Date(profile.subscription_end_date), "MMM d, yyyy")}
                      </p>
                      {daysRemaining !== null && (
                        <p
                          className={`text-sm mt-1 ${
                            isExpired
                              ? "text-red-600 dark:text-red-400"
                              : daysRemaining <= 7
                              ? "text-yellow-600 dark:text-yellow-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {isExpired
                            ? "Expired"
                            : `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Max Devices</p>
                  <p className="text-2xl font-bold">{profile.max_devices}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="text-2xl font-bold capitalize">
                    {profile.subscription_status}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Account Status</p>
                  <p className="text-2xl font-bold">
                    {profile.is_active ? (
                      <span className="text-green-600">Active</span>
                    ) : (
                      <span className="text-red-600">Inactive</span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Available Plans */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Available Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`relative ${
                  plan.current
                    ? "border-2 border-primary shadow-lg"
                    : "hover:shadow-md transition-shadow"
                }`}
              >
                {plan.current && (
                  <div className="absolute top-4 right-4">
                    <Badge variant="default">Current</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    {plan.period && (
                      <span className="text-muted-foreground"> / {plan.period}</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.current ? "outline" : "default"}
                    disabled={plan.current}
                  >
                    {plan.current ? "Current Plan" : "Upgrade"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Billing History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Billing History
            </CardTitle>
            <CardDescription>View your past invoices and payments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p>No billing history available</p>
              <p className="text-sm mt-1">
                Your billing history will appear here once you make a payment
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

