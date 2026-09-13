# 无人机激光雷达避障(Drone Collision Avoidance)

一个 ROS + PX4 小项目:让四旋翼无人机装上 Livox 激光雷达,在飞行中自己"看"到障碍物并绕开,最后按航线飞完一圈、原地降落。核心是 **VFH+ 避障算法**,实机和 Gazebo 仿真都跑过。

作者:hwg111

## 这个小项目做了什么

- **激光雷达感知**:用 Livox 雷达的点云把周围 360° 的障碍物距离"扫"出来,按 1° 一格存成极坐标直方图;
- **VFH+ 避障决策**:哪个方向离障碍远、又离目标近,就往哪飞;距离越近危险度越高,程序实时选出一条安全航向;
- **完整的任务流程**:状态机串起「起飞 → 悬停 → 带避障飞航点 → 原地转向 → 再飞下一段 → 精准降落」,全程自动(也可以配置成遥控器切 OFFBOARD);
- **速度自适应**:离目标远就飞快点,前方有障碍就自动减速,加斜坡限幅,飞得比较稳;
- **实机 + 仿真两套脚本**:用 tmux 一键拉起所有节点,实机(PX4 330)和虚拟机 Gazebo 仿真各一个;
- **演示视频**:`assets/仿真视频展示.mp4`,仿真里避障飞行的效果。

航线是绕一个矩形巡检一圈:起飞后飞到 (3.9, 0) → 转 90° → (3.9, −5) → 转 180° → (0, −5) → (0, −6) → 最后回 (3.5, −6) 降落,坐标是相对起飞点的偏移(单位米),每个航点都在 `collision_avoidance.cpp` 的 `switch (mission_num)` 状态机里,想改航线直接改那里。

## 运行环境(提前配好就行)

这部分需要自己提前准备,这里先不展开具体配置过程，b站上有详细教程，后续可能补充:

- 虚拟机装好 **Ubuntu**(18.04 或 20.04);
- 装好 **ROS1** 和 **Gazebo** 仿真环境;
- 配好 **MAVROS**、PX4 相关依赖;
- 装个 `tmux`(一键启动脚本要用)。


## 快速开始

```bash
# 编译(工作空间就按 first_task_ws 命名,和启动脚本里的路径一致)
cd ~/first_task_ws
catkin_make
```

**仿真跑一遍:**

```bash
./src/collision_avoidance/shell/shell_for_vmware.sh
```

启动后终端会提示 `1 to go on, else to quit`,输入 `1` 确认起飞,之后就是全自动飞行了。飞完输入 `tmux kill-server` 收尾。

## 目录结构

```
├── assets/                     # 演示视频
├── src/
│   ├── collision_avoidance/    # 核心代码:避障主程序 + 参数 + 启动脚本
│   │   ├── src/collision_avoidance.cpp   # VFH+ 算法和任务状态机都在这一个文件里
│   │   ├── config/collision_avoidance.yaml  # 参数(高度、速度、容差等)
│   │   └── shell/              # 实机 / 仿真一键启动脚本
│   └── livox_ros_driver/       # Livox 官方 ROS 驱动(第三方,直接打包进来了)
└── README.md
```

## 一些说明

- 有些功能(比如紧急反向逃离)目前是半成品状态,阈值没打开,之后可能接着完善;
- 大家可以先看看assets里面的效果，具体配置环境确实比较麻烦，如果有感兴趣的跟着ai配，常见问题的话ai基本都能解决

## 参考

- Livox 官方 ROS 驱动:[Livox-SDK/livox_ros_driver](https://github.com/Livox-SDK/livox_ros_driver)
- VFH 算法论文:Borenstein & Koren, *The Vector Field Histogram — Fast Obstacle Avoidance for Mobile Robots*(1991)

