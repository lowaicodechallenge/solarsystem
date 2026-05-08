"use client";
import { useEffect, useRef, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";

export function useSocket(battleId: string | null, userId: string) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!battleId) return;

    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_battle_room", { battle_id: battleId });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [battleId]);

  const emitScore = useCallback(
    (score: number) => {
      if (!battleId || !socketRef.current) return;
      socketRef.current.emit("battle_score_update", {
        battle_id: battleId,
        user_id: userId,
        score,
      });
    },
    [battleId, userId]
  );

  const emitPoseFrame = useCallback(
    (poseData: unknown) => {
      if (!battleId || !socketRef.current) return;
      socketRef.current.emit("pose_frame", {
        battle_id: battleId,
        user_id: userId,
        pose: poseData,
      });
    },
    [battleId, userId]
  );

  const onScoreUpdate = useCallback(
    (handler: (data: { user1_score: number; user2_score: number }) => void) => {
      socketRef.current?.on("score_updated", handler);
      return () => socketRef.current?.off("score_updated", handler);
    },
    []
  );

  const onOpponentPose = useCallback(
    (handler: (data: unknown) => void) => {
      socketRef.current?.on("opponent_pose", handler);
      return () => socketRef.current?.off("opponent_pose", handler);
    },
    []
  );

  return { emitScore, emitPoseFrame, onScoreUpdate, onOpponentPose };
}
