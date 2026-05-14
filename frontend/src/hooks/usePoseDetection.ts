"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  analyzeByExercise,
  drawPoseSkeleton,
  type PostureIssue,
  type PoseAngles,
  type Keypoint,
} from "@/lib/poseAnalysis";

export type PoseState = {
  keypoints: Keypoint[];
  angles: PoseAngles;
  score: number;
  issues: PostureIssue[];
  signature: number[];
  isDetecting: boolean;
};

const LANDMARK_NAMES = [
  "nose",
  "left_eye_inner", "left_eye", "left_eye_outer",
  "right_eye_inner", "right_eye", "right_eye_outer",
  "left_ear", "right_ear",
  "mouth_left", "mouth_right",
  "left_shoulder", "right_shoulder",
  "left_elbow", "right_elbow",
  "left_wrist", "right_wrist",
  "left_pinky", "right_pinky",
  "left_index", "right_index",
  "left_thumb", "right_thumb",
  "left_hip", "right_hip",
  "left_knee", "right_knee",
  "left_ankle", "right_ankle",
  "left_heel", "right_heel",
  "left_foot_index", "right_foot_index",
];

export function usePoseDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  exercise: string,
  enabled: boolean
) {
  const landmarkerRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  const [state, setState] = useState<PoseState>({
    keypoints: [],
    angles: {},
    score: 0,
    issues: [],
    signature: [],
    isDetecting: false,
  });

  const initLandmarker = useCallback(async () => {
    const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    landmarkerRef.current = landmarker;
  }, []);

  const detect = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    const nowMs = performance.now();
    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      try {
        const results = landmarker.detectForVideo(video, nowMs);
        if (results.landmarks && results.landmarks.length > 0) {
          const w = video.videoWidth;
          const h = video.videoHeight;
          canvas.width = w;
          canvas.height = h;

          const keypoints: Keypoint[] = results.landmarks[0].map(
            (lm: { x: number; y: number; z: number; visibility?: number }, i: number) => ({
              x: lm.x * w,
              y: lm.y * h,
              z: lm.z * w,
              score: lm.visibility ?? 1,
              name: LANDMARK_NAMES[i],
            })
          );

          const analysis = analyzeByExercise(exercise, keypoints);

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, w, h);
            drawPoseSkeleton(ctx, keypoints, analysis.issues, w, h);
          }

          setState({
            keypoints,
            angles: analysis.angles,
            score: analysis.score,
            issues: analysis.issues,
            signature: analysis.signature,
            isDetecting: true,
          });
        }
      } catch {
        // silently continue
      }
    }

    animFrameRef.current = requestAnimationFrame(detect);
  }, [exercise, videoRef, canvasRef]);

  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(animFrameRef.current);
      setState((s) => ({ ...s, isDetecting: false }));
      return;
    }

    let active = true;
    initLandmarker().then(() => {
      if (active) animFrameRef.current = requestAnimationFrame(detect);
    });

    return () => {
      active = false;
      cancelAnimationFrame(animFrameRef.current);
      landmarkerRef.current?.close?.();
    };
  }, [enabled, detect, initLandmarker]);

  return state;
}
