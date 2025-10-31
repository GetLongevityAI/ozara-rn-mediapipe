import * as React from "react";

import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  MediapipeCamera,
  RunningMode,
  usePoseDetection,
  KnownPoseLandmarkConnections,
  type DetectionError,
  type PoseDetectionResultBundle,
  type ViewCoordinator,
} from "react-native-mediapipe";

import {
  useCameraPermission,
  type CameraPosition,
} from "react-native-vision-camera";
import type { RootTabParamList } from "./navigation";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useSettings } from "./app-settings";
import { PoseDrawFrame } from "./Drawing";
import { useSharedValue } from "react-native-reanimated";
import { vec, type SkPoint } from "@shopify/react-native-skia";
import {
  build_keypoints_from_landmarks,
  ExerciseProcessor,
  PoseFeatureExtractor,
} from "typescript-pose-lib";

type Props = BottomTabScreenProps<RootTabParamList, "CameraStream">;

export const CameraStream: React.FC<Props> = () => {
  // TODO : implement settings for face landmark detection
  const { settings } = useSettings();
  const camPerm = useCameraPermission();
  const [permsGranted, setPermsGranted] = React.useState<{
    cam: boolean;
  }>({ cam: camPerm.hasPermission });

  const extractorRef = React.useRef(new PoseFeatureExtractor());
  const processorRef = React.useRef(
    new ExerciseProcessor({
      rep_phases_order: ["standing"],
      pose_vectors: [[0]],
      labels: ["standing"],
      distance_threshold: 0.25,
      phase_change_persistence: 3,
      joint_order: ["left_hip", "right_hip"],
    })
  );

  const askForPermissions = React.useCallback(() => {
    if (camPerm.hasPermission) {
      setPermsGranted((prev) => ({ ...prev, cam: true }));
    } else {
      camPerm.requestPermission().then((granted) => {
        setPermsGranted((prev) => ({ ...prev, cam: granted }));
      });
    }
  }, [camPerm]);

  const [active, setActive] = React.useState<CameraPosition>("back");
  const setActiveCamera = () => {
    setActive((currentCamera) =>
      currentCamera === "front" ? "back" : "front"
    );
  };

  const connections = useSharedValue<SkPoint[]>([]);

  const onResults = React.useCallback(
    (results: PoseDetectionResultBundle, vc: ViewCoordinator): void => {
      const frameDims = vc.getFrameDims(results);
      const pts = results.results[0].landmarks[0] ?? [];
      const newLines: SkPoint[] = [];
      if (pts.length === 0) {
        // console.log("No landmarks detected");
      } else {
        for (const connection of KnownPoseLandmarkConnections) {
          const [a, b] = connection;
          const pt1 = vc.convertPoint(frameDims, pts[a]);
          const pt2 = vc.convertPoint(frameDims, pts[b]);
          newLines.push(vec(pt1.x, pt1.y));
          newLines.push(vec(pt2.x, pt2.y));
        }
      }
      connections.value = newLines;

      const landmarksPts = results.results[0].landmarks[0] ?? [];
      const worldLandmarksPts = results.results[0].worldLandmarks[0] ?? [];

      if (landmarksPts.length === 0 || worldLandmarksPts.length === 0) {
        return;
      }

      const keypoints2d = build_keypoints_from_landmarks(landmarksPts, {
        coordinate_space: "image",
      });

      const keypoints3d = build_keypoints_from_landmarks(worldLandmarksPts, {
        coordinate_space: "world",
      });

      let joint_angles = null;
      try {
        const { joint_angles_relative } =
          extractorRef.current.get_pose_features_3d(keypoints3d, false);
        joint_angles = joint_angles_relative;
      } catch (err) {
        console.error("Error extracting joint angles:", err);
      }

      const result = processorRef.current.evaluate_full_body_frame_feedback(
        keypoints2d,
        joint_angles
      );

      console.log(result.orientation);
      console.log(result.feedback);
    },
    [connections]
  );
  const onError = React.useCallback((error: DetectionError): void => {
    console.log(`error: ${error}`);
  }, []);
  const poseDetection = usePoseDetection(
    {
      onResults: onResults,
      onError: onError,
    },
    RunningMode.LIVE_STREAM,
    `${settings.model}.task`,
    {
      fpsMode: "none",
      forceOutputOrientation: "portrait",
      forceCameraOrientation: "portrait",
      mirrorMode: "mirror-front-only",
    } // supply a number instead to get a specific framerate
  );

  if (permsGranted.cam) {
    return (
      <View style={styles.container}>
        <MediapipeCamera
          style={styles.box}
          solution={poseDetection}
          activeCamera={active}
          resizeMode="cover"
        />
        <PoseDrawFrame connections={connections} style={styles.box} />
        <Pressable style={styles.cameraSwitchButton} onPress={setActiveCamera}>
          <Text style={styles.cameraSwitchButtonText}>Switch Camera</Text>
        </Pressable>
      </View>
    );
  } else {
    return <NeedPermissions askForPermissions={askForPermissions} />;
  }
};

const NeedPermissions: React.FC<{ askForPermissions: () => void }> = ({
  askForPermissions,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.permissionsBox}>
        <Text style={styles.noPermsText}>
          Allow App to use your Camera and Microphone
        </Text>
        <Text style={styles.permsInfoText}>
          App needs access to your camera in order for Object Detection to work.
        </Text>
      </View>
      <Pressable style={styles.permsButton} onPress={askForPermissions}>
        <Text style={styles.permsButtonText}>Allow</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFF0F0",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  box: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  permsButton: {
    padding: 15.5,
    paddingRight: 25,
    paddingLeft: 25,
    backgroundColor: "#F95F48",
    borderRadius: 5,
    margin: 15,
  },
  permsButtonText: {
    fontSize: 17,
    color: "black",
    fontWeight: "bold",
  },
  permissionsBox: {
    backgroundColor: "#F3F3F3",
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CCCACA",
    marginBottom: 20,
  },
  noPermsText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "black",
  },
  permsInfoText: {
    fontSize: 15,
    color: "black",
    marginTop: 12,
  },
  cameraSwitchButton: {
    position: "absolute",
    padding: 10,
    backgroundColor: "#F95F48",
    borderRadius: 20,
    top: 20,
    right: 20,
  },
  cameraSwitchButtonText: {
    color: "white",
    fontSize: 16,
  },
});
