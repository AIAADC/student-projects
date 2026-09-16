#!/bin/bash

# 创建会话和第一个窗口
tmux new-session -d -s ros_session -n main_nodes

# Pane 0: roscore
tmux send-keys -t ros_session:0 'roscore' C-m

# Pane 1: location.launch
tmux split-window -h -t ros_session:0
tmux send-keys -t ros_session:0.1 'sleep 3; roslaunch tutorial_gazebo sim.launch' C-m

# 整理第一个窗口布局
tmux select-layout -t ros_session:0 tiled

# --------------------
# 第二窗口（监控和任务）
# --------------------
tmux new-window -t ros_session:1 -n monitors_mission

# Pane 0: /mavros/local_position/pose
tmux send-keys -t ros_session:1 'sleep 6; rostopic echo /mavros/local_position/pose' C-m

# Pane 3: complete_mission.launch
tmux split-window -v -t ros_session:1
tmux send-keys -t ros_session:1.1 'sleep 7; source ~/first_task_ws/devel/setup.bash; roslaunch collision_avoidance collision_avoidance.launch' C-m

# 整理第二个窗口布局
tmux select-layout -t ros_session:1 tiled

# 附加到会话并显示第一个窗口
tmux select-window -t ros_session:0
tmux attach-session -t ros_session:1