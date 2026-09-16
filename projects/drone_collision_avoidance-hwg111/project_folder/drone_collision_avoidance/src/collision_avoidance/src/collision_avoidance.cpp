#include <string>
#include <ros/ros.h>
#include <geometry_msgs/PoseStamped.h>
#include <geometry_msgs/Point.h>
#include <geometry_msgs/PointStamped.h>
#include <geometry_msgs/Twist.h>
#include <geometry_msgs/TwistStamped.h>
#include <mavros_msgs/CommandBool.h>
#include <mavros_msgs/SetMode.h>
#include <mavros_msgs/State.h>
#include <std_msgs/Bool.h>
#include <mavros_msgs/PositionTarget.h>
#include <cmath>
#include <tf/transform_listener.h>
#include <nav_msgs/Odometry.h>
#include <mavros_msgs/CommandLong.h>
#include <std_msgs/String.h>
#include <std_msgs/Empty.h>
#include <std_msgs/Int32.h>
#include <livox_ros_driver/CustomMsg.h>
#include <vector>
#include <algorithm>
#include <limits>
#include <iostream>

using namespace std;
// ====================== 全局常量定义 ======================
#define SAFE_DIST 2.0f          // 安全距离阈值（米），小于此值视为危险区域
#define DRONE_RADIUS 0.2f      // 无人机半径（米），根据实际机型调整
#define SAFETY_MARGIN 0.21f     // 安全的余量（米），增加了缓冲
#define MIN_PASSABLE_DISTANCE 0.25f
#define EFFECTIVE_RADIUS (DRONE_RADIUS + SAFETY_MARGIN)  // 膨胀半径
#define ALTITUDE 1.5f                  // 飞行的高度（相对于起飞点）
#define VFH_ANGLE_BINS 360             // VFH角度分箱数（0-359°），用于构建360°的极坐标直方图
#define VFH_SECTOR_ANGLE 3             // VFH扇区合并角度（度），用于平滑直方图
#define VFH_HISTOGRAM_THRESHOLD 0.3    // VFH直方图危险阈值，大于此值认为该方向有障碍
#define VFH_MAX_ANGLE_CHANGE 45        // 最大转向角度（度），限制无人机一次转向的最大角度
#define VFH_GOAL_DIR_WEIGHT 2.0        // 目标方向权重，用于代价函数
#define VFH_OBSTACLE_AVOID_WEIGHT 1.5  // 避障的权重，用于代价函数

// ====================== 全局变量定义 ======================
// MAVROS核心变量
mavros_msgs::State current_state;      // 无人机当前状态（连接、模式、解锁状态）
nav_msgs::Odometry local_pos;          // 无人机本地位置（全局ENU坐标系）
mavros_msgs::PositionTarget setpoint_raw; // 发送给飞控的原始设定点

// 无人机姿态变量
tf::Quaternion quat;                   // 姿态四元数
double roll, pitch, yaw;               // 滚转、俯仰、偏航角（全局ENU坐标系）
float init_position_x_take_off = 0;    // 起飞点的东坐标（全局ENU）
float init_position_y_take_off = 0;    // 起飞点的北坐标（全局ENU）
float init_position_z_take_off = 0;    // 起飞点的天坐标（全局ENU）
float init_yaw_take_off = 0;           // 起飞时的偏航角
bool flag_init_position = false;       // 起飞点初始化标志

// 雷达分箱变量（机体坐标系，z=0为基准）
std::vector<float> distance_bins;      // 每个角度bin的最小距离
std::vector<int> count_bins;           // 每个角度bin的点数统计
double zero_plane_height = 0.0;        // 高度基准平面（假设雷达安装在z=0高度）
double height_threshold = 0.1;        // 高度筛选阈值，只考虑此高度附近的点
double min_range = 0.1;                // 最小有效距离
double max_range = 30.0;               // 最大有效距离
int num_bins = 360;                    // 分箱数量（默认360）

// 避障参数
float R_outside = 0.0, R_inside = 0.0; // 内外半径（未使用）
float p_R = 0.0, p_r = 0.0, p_xy = 0.5; // 控制的参数（未使用，p_xy用于速度计算）
float vel_collision_max = 0.5;         // 避障最大速度（未使用）
float vel_track_max = 0.5;             // 跟踪最大速度（未使用）
float vel_sp_max = 0.8;                // 设定点最大速度，用于总的速度限幅

// VFH+专用变量
std::vector<float> vfh_histogram;     // VFH极坐标直方图（危险度）
float vfh_goal_direction;             // 目标方向（弧度，注意：当前代码计算的是全局角度）
int vfh_best_sector;                  // 最优扇区索引

// 任务控制变量
int mission_num = 0;                  // 当前任务编号
float if_debug = 0;                   // 调试标志
float err_max = 1.0f;                  // 到达目标点的容错距离

// ====================== 工具的函数 ======================
// 饱和的函数：限制数据范围
float satfunc(float data, float Max) {
    if (fabs(data) > Max) return (data > 0) ? Max : -Max;
    else return data;
}

// ====================== 回调函数 ======================
// 无人机状态回调
void state_cb(const mavros_msgs::State::ConstPtr &msg) {
    current_state = *msg;
}

// 无人机里程计回调（提取了位置/姿态）
void local_pos_cb(const nav_msgs::Odometry::ConstPtr &msg) 
{
    local_pos = *msg;  // 保存位置信息（全局ENU坐标系）
    // 从四元数提取欧拉角（滚转、俯仰、偏航）
    tf::quaternionMsgToTF(local_pos.pose.pose.orientation, quat);
    tf::Matrix3x3(quat).getRPY(roll, pitch, yaw);
    
    // 初始化起飞点（只在第一次收到有效高度时执行）
    if (flag_init_position == false && (local_pos.pose.pose.position.z != 0)) {
        init_position_x_take_off = local_pos.pose.pose.position.x;
        init_position_y_take_off = local_pos.pose.pose.position.y;
        init_position_z_take_off = local_pos.pose.pose.position.z;
        init_yaw_take_off = yaw;
        flag_init_position = true;
        ROS_INFO("起飞点已初始化: 东=%.2f, 北=%.2f, 天=%.2f, 偏航=%.1f°", 
                 init_position_x_take_off, init_position_y_take_off, 
                 init_position_z_take_off, init_yaw_take_off*180/M_PI);
    }
}

// Livox雷达点云分箱（假设点云在机体坐标系下）
void livox_custom_cb(const livox_ros_driver::CustomMsg::ConstPtr& livox_msg) {
    // 重置分箱数据
    distance_bins.assign(num_bins, max_range);  // 初始化所有bin为最大距离
    count_bins.assign(num_bins, 0);             // 点数的清零
    int valid_point=0;
    int total_points = livox_msg->point_num;
    for (int i = 0; i < total_points; i++) {
        const livox_ros_driver::CustomPoint& point = livox_msg->points[i];
        float x = point.x;  // 假设这是机体坐标系下的x（前方距离）
        float y = point.y;  // 假设这是机体坐标系下的y（左侧距离）
        float z = point.z;  // 假设这是机体坐标系下的z（上方距离）
        
         // 添加更多的数据验证
        if (isnan(point.x) || isnan(point.y) || isnan(point.z)) continue;
        if (isinf(point.x) || isinf(point.y) || isinf(point.z)) continue;
        if (point.reflectivity <= 0.01) continue;  // 忽略反射率低的点

        // 筛选机体坐标系z=0附近的点（水平平面障碍物）
        // 注意：这个假设要求雷达安装在无人机z=0高度且水平
        if (fabs(z - zero_plane_height) > height_threshold) {
            continue;
        }
        
        // 计算距离和角度（0-359°）
        float raw_distance = sqrt(x * x + y * y);  // 水平面距离
        if (raw_distance < min_range || raw_distance > max_range) continue;
        float angle_rad = atan2(y, x);          // 注意：atan2(y,x) 得到相对于 x 轴（前方）的角度
        int center_idx = static_cast<int>(round(angle_rad * 180.0 / M_PI));//
        center_idx = (center_idx + 360) % 360; // 归一化到 [0, 359]//

        // === 新增：计算该点阻挡的角度半宽 ===//
        // 当距离小于等于膨胀半径时，视为完全阻挡半平面（半宽设为90度）//
        float half_angle_rad = (raw_distance > EFFECTIVE_RADIUS) ?//
                               asin(EFFECTIVE_RADIUS / raw_distance) : M_PI / 2.0;//
        int half_width = static_cast<int>(round(half_angle_rad * 180.0 / M_PI));//
        half_width = std::min(half_width, 90); // 限制最大半宽为90度（即总共影响180度范围）//

        float safe_distance = raw_distance - EFFECTIVE_RADIUS;
        if (safe_distance < 0) safe_distance = 0;  // 障碍物已进入膨胀区域

        // float angle = atan2(y, x);  // 弧度，atan2(y,x)得到相对于x轴（前方）的角度
        // int angle_bin = static_cast<int>((angle * 180.0 / M_PI));  // 转换为度数
        
        // 角度归一化到0-359°
        // if (angle_bin < 0) angle_bin += 360;   // 负角度转为正角度
        // if (angle_bin >= 360) angle_bin -= 360; // 大于360度的归一化
        
        // // 记录每个角度bin的最小距离
        // if (angle_bin >= 0 && angle_bin < num_bins) {
        //     if (raw_distance >= min_range && raw_distance <= max_range && 
        //         !isinf(raw_distance) && !isnan(raw_distance)) {
        //         if (safe_distance < distance_bins[angle_bin]) {
        //             distance_bins[angle_bin] = safe_distance;  // 保存最小距离
        //         }
        //         count_bins[angle_bin]++;  // 统计的点数
        //     }
         for (int d = -half_width; d <= half_width; d++) {
            int idx = (center_idx + d + 360) % 360; // 处理角度环绕

            // 更新该扇区的最小安全距离（取所有点中的最小值）
            if (safe_distance < distance_bins[idx]) {
                distance_bins[idx] = safe_distance;
            }
            count_bins[idx]++; // 统计点数（可用于调试）
        }
        valid_point++;
    }
    
    // 无点的bin设为最大距离（无障碍）
    for (int i = 0; i < num_bins; i++) {
        if (count_bins[i] == 0) {
            distance_bins[i] = max_range;
        }
    }
    
    // 调试的输出
    ROS_INFO("雷达的数据: 有效的点数=%d/%d, 最近的障碍=%.2fm 扇区的范围=[%.2f, %.2f]m", 
             valid_point, livox_msg->point_num,
             *min_element(distance_bins.begin(), distance_bins.end()) ,              
             *min_element(distance_bins.begin(), distance_bins.end()),
             *max_element(distance_bins.begin(), distance_bins.end()));
             ROS_INFO("雷达的统计: 0°=%.2fm, 90°=%.2fm, 180°=%.2fm, 270°=%.2fm",
         distance_bins[0], distance_bins[90],
         distance_bins[180], distance_bins[270]);
}

// ====================== 基础控制函数 ======================
// 位置巡航函数（飞向指定点）
float mission_pos_cruise_last_position_x = 0;
float mission_pos_cruise_last_position_y = 0;
bool mission_pos_cruise_flag = false;
bool mission_pos_cruise(float x, float y, float z, float target_yaw, float error_max) {
    // 记录起始位置（用于后续判断）
    if (mission_pos_cruise_flag == false) {
        mission_pos_cruise_last_position_x = local_pos.pose.pose.position.x;
        mission_pos_cruise_last_position_y = local_pos.pose.pose.position.y;
        mission_pos_cruise_flag = true;
        ROS_INFO("位置巡航开始: 目标=(%.2f, %.2f, %.2f)", x, y, z);
    }
    
    // 设置位置控制模式（类型掩码表示只控制位置和偏航）
    setpoint_raw.type_mask = 8 + 16 + 32 + 64 + 128 + 256 + 512 + 2048;
    setpoint_raw.coordinate_frame = 1;  // 1表示FRAME_LOCAL_NED（局部坐标系）
    // 计算绝对目标位置（相对于起飞点）
    setpoint_raw.position.x = x + init_position_x_take_off;
    setpoint_raw.position.y = y + init_position_y_take_off;
    setpoint_raw.position.z = z + init_position_z_take_off;
    setpoint_raw.yaw = target_yaw;  // 目标偏航角
    
    // 检查是否到达目标
    float dx = local_pos.pose.pose.position.x - setpoint_raw.position.x;
    float dy = local_pos.pose.pose.position.y - setpoint_raw.position.y;
    float dz = local_pos.pose.pose.position.z - setpoint_raw.position.z;
    float dyaw = yaw - target_yaw;
    
    bool reach_goal = (fabs(dx) < error_max &&
                       fabs(dy) < error_max &&
                       fabs(dz) < error_max &&
                       fabs(dyaw) < 0.1);  // 偏航角容错0.1弧度
    
    if (reach_goal) {
        ROS_INFO("到达目标点 (%.2f, %.2f, %.2f) | 误差=(%.2f, %.2f, %.2f, %.1f°)", 
                x, y, z, dx, dy, dz, dyaw*180/M_PI);
        mission_pos_cruise_flag = false;
        return true;
    } else {
        ROS_INFO("位置巡航中: 目标=(%.2f, %.2f, %.2f), 当前=(%.2f, %.2f, %.2f), 误差=(%.2f, %.2f, %.2f, %.1f°)", 
                 x, y, z, 
                 local_pos.pose.pose.position.x - init_position_x_take_off,
                 local_pos.pose.pose.position.y - init_position_y_take_off,
                 local_pos.pose.pose.position.z - init_position_z_take_off,
                 dx, dy, dz, dyaw*180/M_PI);
    }
    
    return false;
}
// ====================== 偏航角转向函数 ======================
// 功能：控制无人机原地旋转到目标偏航角（ENU坐标系，弧度）
// 参数：
//   target_yaw        - 目标偏航角（弧度）
//   yaw_error_max     - 允许的误差（弧度）
// 返回值：true=转向完成，false=转向中
bool mission_yaw_turn(float target_yaw, float yaw_error_max) {
    // 静态变量记录转向起始状态
    static bool yaw_turn_init = false;
    static float start_yaw;
    static ros::Time start_time;
    
    // 初始化（第一次调用时记录）
    if (!yaw_turn_init) {
        start_yaw = yaw;  // 使用全局变量 yaw（从里程计更新）
        start_time = ros::Time::now();
        yaw_turn_init = true;
        ROS_INFO("偏航转向开始: 目标=%.1f°, 当前=%.1f°", 
                 target_yaw * 180 / M_PI, start_yaw * 180 / M_PI);
    }
    
    // 设置控制指令：保持当前位置不变，仅改变偏航角
    setpoint_raw.type_mask = 8 + 16 + 32 + 64 + 128 + 256 + 512 + 2048;  // 修正掩码，与 mission_pos_cruise 一致
    setpoint_raw.coordinate_frame = 1;  // FRAME_LOCAL_NED
    setpoint_raw.position.x = local_pos.pose.pose.position.x;
    setpoint_raw.position.y = local_pos.pose.pose.position.y;
    setpoint_raw.position.z = local_pos.pose.pose.position.z;
    setpoint_raw.yaw = target_yaw;
    
    // 计算当前偏航与目标的差值（处理角度环绕）
    float yaw_diff = fabs(yaw - target_yaw);
    yaw_diff = std::min(yaw_diff, static_cast<float>(2 * M_PI - yaw_diff));
    
    // 检查是否到达目标
    bool reached = yaw_diff < yaw_error_max;
    
    // 超时处理（10秒后强制结束，防止去死锁）
    if (ros::Time::now() - start_time > ros::Duration(10.0)) {
        ROS_WARN("偏航转向超时，强制去结束");
        yaw_turn_init = false;
        return true;
    }
    
    if (reached) {
        ROS_INFO("偏航转向完成: 目标=%.1f°, 当前=%.1f°, 误差=%.1f°", 
                 target_yaw * 180 / M_PI, yaw * 180 / M_PI, yaw_diff * 180 / M_PI);
        yaw_turn_init = false;
        return true;
    } else {
        ROS_INFO("偏航转向中: 目标=%.1f°, 当前=%.1f°, 误差=%.1f°", 
                 target_yaw * 180 / M_PI, yaw * 180 / M_PI, yaw_diff * 180 / M_PI);
        return false;
    }
}
// ================精准降落函数==================
float precision_land_init_position_x = 0;
float precision_land_init_position_y = 0;
bool precision_land_init_position_flag = false;
ros::Time precision_land_last_time;
bool precision_land();
bool precision_land()
{
	if (!precision_land_init_position_flag)
	{
		precision_land_init_position_x = local_pos.pose.pose.position.x;
		precision_land_init_position_y = local_pos.pose.pose.position.y;
        precision_land_last_time = ros::Time::now();
		precision_land_init_position_flag = true;
		ROS_INFO("精准降落初始化: 位置=(%.2f, %.2f)", 
                precision_land_init_position_x, precision_land_init_position_y);
	}
	
	setpoint_raw.position.x = precision_land_init_position_x;
	setpoint_raw.position.y = precision_land_init_position_y;
	setpoint_raw.position.z = -0.12;
	setpoint_raw.type_mask = /*1 + 2 + 4 + 8 + 16 + 32*/ +64 + 128 + 256 + 512 /*+ 1024 + 2048*/;
	setpoint_raw.coordinate_frame = 1;
	
    if(ros::Time::now() - precision_land_last_time > ros::Duration(5.0))
    {
        ROS_INFO("Precision landing complete.");
        precision_land_init_position_flag = false; // Reset for next landing
        return true;
    }
    
    ROS_INFO("精准降落中: 高度=%.2f", local_pos.pose.pose.position.z);
    return false;
}
// ====================== 算法核心函数 ======================

// 初始化VFH直方图（清零）
void vfh_init_histogram() {
    // 创建360个0.0的扇区，每个扇区代表1°方向
    vfh_histogram.assign(VFH_ANGLE_BINS, 0.0);
    /* 注：直方图索引0=正前方(0°)，90°=左侧，180°=后方，270°=右侧（机体坐标系） */
}

// 构建VFH极坐标直方图（距离→危险度）
void vfh_build_histogram() {
    vfh_init_histogram();  // 先清空历史数据
    
    // 1. 填充原始距离直方图（近障碍→高值）
    // for (int i = 0; i < VFH_ANGLE_BINS; i++) {
    //     /* 
    //      * distance_bins[i]：来自传感器的预处理数据
    //      * 假设已通过ray_casting等方法将环境投影到360个扇区
    //      * 每个扇区存储该方向最近障碍物距离
    //      */
    //     if (distance_bins[i] < max_range) {
    //         // 危险度计算：距离越近值越高（1.0=最近，0.0=超出范围）
    //         vfh_histogram[i] = 1.0 - (distance_bins[i] / max_range);
    //     }else {
    //     vfh_histogram[i] = 0.0;
    // }

        // 超出范围的扇区保持0.0（安全）
    // }
    for (int i = 0; i < VFH_ANGLE_BINS; i++) {
    // 基于 SAFE_DIST 的线性危险度：距离越近，危险度越高
    float danger = std::max(0.0f, 1.0f - distance_bins[i] / SAFE_DIST);
    vfh_histogram[i] = std::min(1.0f, danger);   // 限制在 [0,1] 区间
}
    // 1. 填充原始距离直方图（基于 SAFE_DIST 的线性危险度）
// for (int i = 0; i < VFH_ANGLE_BINS; i++) {
//     float danger = std::max(0.0f, 1.0f - distance_bins[i] / SAFE_DIST);
//     vfh_histogram[i] = std::min(1.0f, danger);  // 限制在[0,1]区间
// }

    // 2. 扇区平滑（关键步骤：消除传感器噪声和离散化影响）
    std::vector<float> smoothed_histogram(VFH_ANGLE_BINS, 0.0);
    int sector_half = VFH_SECTOR_ANGLE / 2;  // 计算平滑窗口半宽（2°）
    
    for (int i = 0; i < VFH_ANGLE_BINS; i++) {
        float sum = 0.0;
        int count = 0;
        // 遍历当前扇区±2°的窗口（共5个扇区）
        for (int j = -sector_half; j <= sector_half; j++) {
            // 处理360°循环：(i+j+360)%360 保证索引在[0,359]
            int idx = (i + j + VFH_ANGLE_BINS) % VFH_ANGLE_BINS;
            sum += vfh_histogram[idx];
            count++;
        }
        // 计算窗口内平均危险度（降低噪声影响）
        smoothed_histogram[i] = sum / count;
    }
    vfh_histogram = smoothed_histogram;  // 更新为平滑后的直方图
    
    /* 潜在问题修复： 
     * 原始代码可能因平滑导致安全扇区误判，建议增加最小安全宽度检查
     * 例如：要求连续3个扇区<阈值才视为安全，防止窄缝通过 */
}

// 计算目标方向（无人机→目标点）
void vfh_calc_goal_direction(float target_e, float target_n) {
    // ===== 坐标系关键说明 =====
    // 全局坐标系：ENU（东-北-天），0°=正东（x轴），90°=正北（y轴）
    // 机体坐标系：0°=无人机机头方向（前向），90°=左侧（Livox约定）
    
    // 1. 计算ENU坐标系下的当前位置（相对于起飞点）
    float curr_e = local_pos.pose.pose.position.x - init_position_x_take_off;
    float curr_n = local_pos.pose.pose.position.y - init_position_y_take_off;
    
    // 2. 计算ENU坐标系下的目标向量（相对于机体）
    float dx_enu = target_e - curr_e;  // 东方向的差
    float dy_enu = target_n - curr_n;  // 北方向的差
    
    // 3. 计算ENU全局角度（0°=东，90°=北）
    float global_angle_enu = atan2(dy_enu, dx_enu);  // 注意：atan2(北差, 东差)
    
    // 4. 转换为机体坐标系角度 = 全局目标角 - 无人机当前偏航
    vfh_goal_direction = global_angle_enu - yaw;
    
    // 5. 归一化到[-π, π]（处理角度越界）
    while (vfh_goal_direction > M_PI) vfh_goal_direction -= 2 * M_PI;
    while (vfh_goal_direction < -M_PI) vfh_goal_direction += 2 * M_PI;
    
    // 调试输出
    ROS_INFO("目标方向计算: ENU=(%.2f,%.2f) -> (%.2f,%.2f) | DX=%.2f, DY=%.2f | "
             "全局角=%.1f° | 偏航=%.1f° | 机体角=%.1f°", 
             curr_e, curr_n, target_e, target_n, 
             dx_enu, dy_enu, 
             global_angle_enu*180/M_PI, 
             yaw*180/M_PI, 
             vfh_goal_direction*180/M_PI);
}

// 选择最优扇区（无障+朝向目标）
int vfh_select_best_sector() {
    std::vector<int> free_sectors;  // 存储安全扇区索引
    
    // 1. 筛选安全扇区（危险度低于阈值）
    for (int i = 0; i < VFH_ANGLE_BINS; i++) {
        if (vfh_histogram[i] < VFH_HISTOGRAM_THRESHOLD&&distance_bins[i] >= MIN_PASSABLE_DISTANCE) {
            free_sectors.push_back(i);
        }
    }
    
    // 调试输出安全扇区
    std::string free_sectors_str = "[";
    for (int sector : free_sectors) {
        free_sectors_str += std::to_string(sector) + ", ";
    }
    if (!free_sectors.empty()) {
        free_sectors_str.pop_back(); // 移除最后一个逗号
        free_sectors_str.pop_back(); // 移除最后一个空格
    }
    free_sectors_str += "]";
    // ROS_INFO("安全扇区: %s (共%d个)", free_sectors_str.c_str(), (int)free_sectors.size());

    // 2. 应急的处理：无安全扇区时选择目标方向
    if (free_sectors.empty()) {
        ROS_WARN("VFH+: 无安全扇区");
        // 将目标方向弧度转为0-359°的扇区索引
        int goal_sector = (int)round(vfh_goal_direction * 180.0 / M_PI);
        // 处理负角度：-10° → 350°
        if (goal_sector < 0) goal_sector += 360;
        goal_sector = goal_sector % 360;  // 确保在[0,359]
        
        ROS_WARN("VFH+: 无安全扇区，使用目标方向: %.1f° -> 扇区 %d°", 
                vfh_goal_direction*180/M_PI, goal_sector);
        return goal_sector;
    }

    // 3. 代价函数选择最优扇区
    float min_cost = 1e9;
    int best_sector = free_sectors[0];
    float goal_angle_deg = vfh_goal_direction * 180.0 / M_PI;  // 目标的方向（机体坐标系，度）
while (goal_angle_deg < 0) goal_angle_deg += 360.0;
while (goal_angle_deg >= 360.0) goal_angle_deg -= 360.0;
    // 调试输出
    std::string cost_debug = "代价的计算:\n";
    for (int sector : free_sectors) {
        // ===== 计算角度差（考虑360°循环）=====
        float angle_diff = fabs(sector - goal_angle_deg);
        // 取最小角度差（例如：350°和10°的差应为20°而非340°）
        angle_diff = std::min(angle_diff, 360.0f - angle_diff);
        
        // ===== 代价函数设计 =====
        // 1. 目标方向代价：角度差越小代价越低（归一化到[0,1]）
        float goal_cost = angle_diff / 180.0;  // 180°差=最大代价1.0
        
        // 2. 避障代价：扇区危险度（0-1）
        float obstacle_cost = vfh_histogram[sector];
        
        // 3. 组合代价（加权和）
        float cost = goal_cost * VFH_GOAL_DIR_WEIGHT + 
                     obstacle_cost * VFH_OBSTACLE_AVOID_WEIGHT;

        // ===== 转向平滑惩罚 =====
        // 当前扇区角度与上一次选择的扇区角度差
        float prev_sector = vfh_best_sector;  // 使用历史选择
        float yaw_diff = fabs(sector - prev_sector);
        yaw_diff = std::min(yaw_diff, 360.0f - yaw_diff);
        
        // 转向过大时施加惩罚（防止震荡）
        float turn_penalty = 0.0;
        if (yaw_diff > VFH_MAX_ANGLE_CHANGE) {
            turn_penalty = 10.0;  // 大幅增加代价（远高于正常范围）
            cost += turn_penalty;
        }

        // 更新最小代价扇区
        if (cost < min_cost) {
            min_cost = cost;
            best_sector = sector;
        }
        
        cost_debug += "  扇区 " + std::to_string(sector) + "°: " +
                      "角度差=" + std::to_string(angle_diff) + "°, " +
                      "目标代价=" + std::to_string(goal_cost) + ", " +
                      "避障代价=" + std::to_string(obstacle_cost) + ", " +
                      "转向差=" + std::to_string(yaw_diff) + "°, " +
                      "转向惩罚=" + std::to_string(turn_penalty) + ", " +
                      "总代价=" + std::to_string(cost) + "\n";
    }
    
    ROS_DEBUG_STREAM(cost_debug << "  最优的扇区: " << best_sector << "°");
    
    /* 重要改进：
     * 1. 使用历史扇区(vfh_best_sector)而非当前偏航角进行转向平滑
     *   （原代码用current_yaw_deg比较错误，因为扇区索引本身就是机体坐标系）
     * 2. 惩罚项使用固定大值10.0（确保>1.0的正常代价范围） */
    
    return best_sector;
}

// VFH速度计算（朝向最优扇区）
void vfh_calc_velocity(float target_e, float target_n, float& vx, float& vy) {
    // 1. 构建环境感知模型
    vfh_build_histogram();  // 更新障碍物直方图
    
    // 2. 计算导航目标方向
    vfh_calc_goal_direction(target_e, target_n);
    
    // 3. 决策最优运动方向
    vfh_best_sector = vfh_select_best_sector();  // 返回0-359°的扇区角度
    
    // 4. 转换为弧度（用于三角函数）
    float best_angle_rad = vfh_best_sector * M_PI / 180.0;
    
    // 5. 计算速度大小（与目标距离成正比，带限幅）
    float curr_e = local_pos.pose.pose.position.x - init_position_x_take_off;
    float curr_n = local_pos.pose.pose.position.y - init_position_y_take_off;
    float dx_enu = target_e - curr_e;
    float dy_enu = target_n - curr_n;
    float target_dist = sqrt(dx_enu*dx_enu + dy_enu*dy_enu);
    
    // 速度的公式：v = k * d，但不超过最大速度
    float vel_mag = satfunc(target_dist * p_xy, vel_sp_max);
    
    // ===== 新增：根据最优扇区安全距离调整速度 =====
    float min_safe_dist_in_best_sector = distance_bins[vfh_best_sector];
    // 安全距离小于2米时开始线性减速，安全距离为0时速度降至20%
    // float speed_factor = std::min(1.0f, min_safe_dist_in_best_sector / 2.0f);
    // speed_factor = std::max(0.2f, speed_factor);  // 限制最小速度比例
    // vel_mag *= speed_factor;
    // ===========================================
    // 定义速度因子计算参数
    float min_safe_dist = distance_bins[vfh_best_sector];
    const float D_SAFE = 2.0;   // 安全距离阈值（米），超过此值全速
    const float D_MIN = 0.3;    // 最小距离阈值（米），低于此值用最小速度
    const float V_MIN_RATIO = 0.2; // 最小速度比例

    float speed_factor;
    if (min_safe_dist >= D_SAFE) {
        speed_factor = 1.0;
    } else if (min_safe_dist <= D_MIN) {
        speed_factor = V_MIN_RATIO;
    } else {
        // 线性插值
        speed_factor = V_MIN_RATIO + (1.0 - V_MIN_RATIO) * 
                    (min_safe_dist - D_MIN) / (D_SAFE - D_MIN);
    }

    // 计算原始速度大小
    float raw_vel_mag = satfunc(target_dist * p_xy, vel_sp_max);
    float new_vel_mag = raw_vel_mag * speed_factor;

    // 速度变化率限制（斜坡）
    static float last_vel_mag = 0;
    const float MAX_DELTA_PER_CYCLE = 0.3; // 每周期最大变化量（20Hz时对应6 m/s²）
    float delta = new_vel_mag - last_vel_mag;
    delta = std::max(-MAX_DELTA_PER_CYCLE, std::min(MAX_DELTA_PER_CYCLE, delta));
    vel_mag = last_vel_mag + delta;
    last_vel_mag = vel_mag;

    // 6. 生成机体坐标系速度（x=前向，y=左向）
    vx = vel_mag * cos(best_angle_rad);  // 前向的分量
    vy = vel_mag * sin(best_angle_rad);  // 左向的分量
    
    // 关键的修正：PX4期望机体坐标系y=右，但Livox是y=左，所以取负号
    //vy = -vy;
    
    /* 坐标系说明：
     * 修正后机体坐标系：vx>0=前进，vy>0=向右（PX4标准） */
    
    // 调试输出
    ROS_INFO("VFH+: 目标=(%.2f,%.2f) | 当前=(%.2f,%.2f) | 距离=%.2f | "
             "最优扇区:%d° | 目标方向:%.1f° | 修正后速度:(%.2f,%.2f)m/s", 
             target_e, target_n, curr_e, curr_n, target_dist,
             vfh_best_sector, vfh_goal_direction*180/M_PI, vx, vy);
}

// VFH避障的任务（主控制循环）
bool collision_avoidance_mission(float target_e, float target_n, 
                                float target_z, float target_yaw, 
                                float err_max) {
                                     // ========== 新增：紧急避障检测 ==========
    float emergency_threshold = 0.0;
    float emergency_vel_scale = 0.8;
    auto min_it = std::min_element(distance_bins.begin(), distance_bins.end());
    float min_dist = *min_it;
    int min_angle_idx = std::distance(distance_bins.begin(), min_it);
    if (min_dist < emergency_threshold) {
        ROS_WARN("=== 紧急避障触发！最近障碍物距离=%.2fm，角度=%d° ===", min_dist, min_angle_idx);

        float escape_angle_rad = (min_angle_idx * M_PI / 180.0) + M_PI;
        while (escape_angle_rad > M_PI) escape_angle_rad -= 2 * M_PI;
        while (escape_angle_rad < -M_PI) escape_angle_rad += 2 * M_PI;

        float vel_mag = emergency_vel_scale * vel_sp_max;
        float vx_body = vel_mag * cos(escape_angle_rad);
        float vy_body = vel_mag * sin(escape_angle_rad);

        vx_body = satfunc(vx_body, vel_sp_max);
        vy_body = satfunc(vy_body, vel_sp_max);

        float vx_ned = vx_body * cos(yaw) - vy_body * sin(yaw);
        float vy_ned = vx_body * sin(yaw) + vy_body * cos(yaw);

        setpoint_raw.type_mask = 1 + 2 + 64 + 128 + 256 + 2048;
        setpoint_raw.coordinate_frame = 1;
        setpoint_raw.velocity.x = vx_ned;
        setpoint_raw.velocity.y = vy_ned;
        setpoint_raw.velocity.z = 0;
        setpoint_raw.position.z = target_z + init_position_z_take_off;
        setpoint_raw.yaw = target_yaw;
        return false; // 任务未完成
    }
    // ========== 紧急避障检测结束 ==========
    // 1. 到达目标点检测（相对起飞点的ENU坐标）
    float curr_e = local_pos.pose.pose.position.x - init_position_x_take_off;
    float curr_n = local_pos.pose.pose.position.y - init_position_y_take_off;
    float curr_z = local_pos.pose.pose.position.z - init_position_z_take_off;
    
    bool reach_goal = (fabs(curr_e - target_e) < err_max &&
                       fabs(curr_n - target_n) < err_max &&
                       fabs(curr_z - target_z) < err_max 
                    /*    &&fabs(yaw - target_yaw) < 0.1*/);  // 偏航角容错0.1弧度
    
    if (reach_goal) {
        ROS_INFO("VFH+: 目标点到达 (%.2f, %.2f, %.2f) | 误差=(%.2f, %.2f, %.2f, %.1f°)", 
                target_e, target_n, target_z,
                curr_e - target_e, curr_n - target_n, curr_z - target_z, 
                (yaw - target_yaw)*180/M_PI);
        return true;  // 任务完成
    } else {
        ROS_INFO("VFH+: 任务中 | 目标=(%.2f,%.2f) | 当前=(%.2f,%.2f) | 误差=(%.2f,%.2f)", 
                 target_e, target_n, curr_e, curr_n, curr_e - target_e, curr_n - target_n);
    }

    // 2. 计算避障速度（机体坐标系，Livox约定：x=前, y=左）
    float vx_body, vy_body;
    vfh_calc_velocity(target_e, target_n, vx_body, vy_body);

    // 3. 速度限幅（防止超速）
    vx_body = satfunc(vx_body, vel_sp_max);
    vy_body = satfunc(vy_body, vel_sp_max);
    
    // 调试输出
    ROS_INFO("VFH+: 限幅后速度: vx_body=%.2f, vy_body=%.2f", vx_body, vy_body);

    // 4. 机体坐标系 → NED全局坐标系
    // 注意：PX4使用NED坐标系（北-东-下）
    // 机体坐标系(x,y) → NED(N,E):
    //   N = x*sin(yaw) + y*cos(yaw)  // 北方向
    //   E = x*cos(yaw) - y*sin(yaw)  // 东方向
// 正确转换：机体坐标系（前-右）→ NED（北-东）
float vx_ned = vx_body * cos(yaw) - vy_body * sin(yaw); // 北方向
float vy_ned = vx_body * sin(yaw) + vy_body * cos(yaw); // 东方向
    
    // 调试输出
    ROS_INFO("VFH+: 坐标系转换 | yaw=%.1f° | vx_ned=%.2f, vy_ned=%.2f", 
             yaw*180/M_PI, vx_ned, vy_ned);

    // 5. 生成控制指令（MAVROS setpoint_raw）
    setpoint_raw.type_mask = 1 + 2 + 64 + 128 + 256 + 2048;  // 速度控制掩码
    setpoint_raw.coordinate_frame = 1;  // FRAME_LOCAL_NED

    setpoint_raw.velocity.x = vx_ned;  // NED.x = 北
    setpoint_raw.velocity.y = vy_ned;  // NED.y = 东
    setpoint_raw.velocity.z = 0;       // 水平运动，z速度=0（NED.z=下，0=不升降）

    // 保持高度（绝对高度 = 目标高度 + 起飞点高度）
    setpoint_raw.position.z = target_z + init_position_z_take_off;

    setpoint_raw.yaw = target_yaw;  // 目标偏航角（NED全局坐标系，生效！）

    return false;  // 任务未完成
}
// ====================== 参数打印函数 ======================
void print_param() {
    std::cout << "=== 控制的参数 ===" << std::endl;
    std::cout << "err_max: " << err_max << std::endl;
    std::cout << "ALTITUDE: " << ALTITUDE << std::endl;
    std::cout << "if_debug: " << if_debug << std::endl;
    std::cout << "zero_plane_height: " << zero_plane_height << std::endl;
    std::cout << "vel_sp_max: " << vel_sp_max << std::endl;
    if (if_debug == 1) std::cout << "自动offboard" << std::endl;
    else std::cout << "遥控器offboard" << std::endl;
    
    // 添加坐标系说明
    std::cout << "\n=== 坐标系说明 ===" << std::endl;
    std::cout << "全局坐标系: ENU (东-北-天)" << std::endl;
    std::cout << "雷达坐标系: Livox (前-左-上)" << std::endl;
    std::cout << "飞控期望: NED (北-东-下)" << std::endl;
    std::cout << "目标点定义: (东偏移, 北偏移)" << std::endl;
}

// ====================== 主函数（任务的流程） ======================
int main(int argc, char **argv) {
    // 防止中文乱码
    setlocale(LC_ALL, "");

    // 初始化ROS节点
    ros::init(argc, argv, "vfh_plus_collision_avoidance");
    ros::NodeHandle nh;

    // 订阅/发布话题
    ros::Subscriber state_sub = nh.subscribe<mavros_msgs::State>("mavros/state", 10, state_cb);
    ros::Subscriber local_pos_sub = nh.subscribe<nav_msgs::Odometry>("/mavros/local_position/odom", 10, local_pos_cb);
    ros::Subscriber livox_sub = nh.subscribe<livox_ros_driver::CustomMsg>("/livox/lidar", 10, livox_custom_cb);
    ros::Publisher mavros_setpoint_pos_pub = nh.advertise<mavros_msgs::PositionTarget>("/mavros/setpoint_raw/local", 100);

    // 服务客户端
    ros::ServiceClient arming_client = nh.serviceClient<mavros_msgs::CommandBool>("mavros/cmd/arming");
    ros::ServiceClient set_mode_client = nh.serviceClient<mavros_msgs::SetMode>("mavros/set_mode");

    // 频率设置（20Hz）
    ros::Rate rate(20);

    // 读取ROS的参数
    nh.param<float>("err_max", err_max, 0.2);
    nh.param<float>("if_debug", if_debug, 0);
    nh.param<double>("zero_plane_height", zero_plane_height, 0.0);
    nh.param<double>("height_threshold", height_threshold, 0.05);
    nh.param<double>("min_range", min_range, 0.1);
    nh.param<double>("max_range", max_range, 30.0);
    nh.param<int>("num_bins", num_bins, 360);
    nh.param<float>("R_outside", R_outside, 0.0);
    nh.param<float>("R_inside", R_inside, 0.0);
    nh.param<float>("p_R", p_R, 0.0);
    nh.param<float>("p_r", p_r, 0.0);
    nh.param<float>("p_xy", p_xy, 0.5);
    nh.param<float>("vel_collision_max", vel_collision_max, 0.5);
    nh.param<float>("vel_track_max", vel_track_max, 0.5);
    nh.param<float>("vel_sp_max", vel_sp_max, 0.8);
    
    // 打印参数
    print_param();

    // 用户确认启动
    int choice = 0;
    std::cout << "1 to go on , else to quit" << std::endl;
    std::cin >> choice;
    if (choice != 1) return 0;
    ros::spinOnce();
    rate.sleep();
    
    // 等待飞控连接
    while (ros::ok() && !current_state.connected) {
        ros::spinOnce();
        rate.sleep();
    }
    ROS_INFO("飞控已连接");

    // 初始位置设置（起飞点）
    setpoint_raw.type_mask = 64 + 128 + 256 + 512;  // 位置控制
    setpoint_raw.coordinate_frame = 1;
    setpoint_raw.position.x = 0 + init_position_x_take_off;
    setpoint_raw.position.y = 0 + init_position_y_take_off;
    setpoint_raw.position.z = ALTITUDE + init_position_z_take_off;
    setpoint_raw.yaw = 0;

    // 预发送指令（飞控要求，建立连接）
    for (int i = 100; ros::ok() && i > 0; --i) {
        mavros_setpoint_pos_pub.publish(setpoint_raw);
        ros::spinOnce();
        rate.sleep();
    }
    std::cout << "初始指令发送完成" << std::endl;

    // OFFBOARD的模式+解锁
    mavros_msgs::SetMode offb_set_mode;
    offb_set_mode.request.custom_mode = "OFFBOARD";
    mavros_msgs::CommandBool arm_cmd;
    arm_cmd.request.value = true;
    ros::Time last_request = ros::Time::now();

    while (ros::ok()) {
        // 切换OFFBOARD模式
        if (current_state.mode != "OFFBOARD" && (ros::Time::now() - last_request > ros::Duration(3.0))) {
            if (if_debug == 1) {
                if (set_mode_client.call(offb_set_mode) && offb_set_mode.response.mode_sent) {
                    ROS_INFO("Offboard模式已启用");
                }
            } else {
                ROS_INFO("等待遥控器切换OFFBOARD模式");
            }
            last_request = ros::Time::now();
        } 
        // 解锁无人机
        else if (!current_state.armed && (ros::Time::now() - last_request > ros::Duration(3.0))) {
            if (arming_client.call(arm_cmd) && arm_cmd.response.success) {
                ROS_INFO("无人机已解锁");
            }
            last_request = ros::Time::now();
        }

        // 起飞到指定高度后进入任务
        if (fabs(local_pos.pose.pose.position.z - (ALTITUDE + init_position_z_take_off)) < 0.2) {
            if (ros::Time::now() - last_request > ros::Duration(1.0)) {
                mission_num = 1;
                last_request = ros::Time::now();
                break;
            }
        }

        mission_pos_cruise(0, 0, ALTITUDE, 0, err_max); 
        ROS_INFO("起飞中... 当前的高度: %.2f m", local_pos.pose.pose.position.z - init_position_z_take_off);
        mavros_setpoint_pos_pub.publish(setpoint_raw);
        ros::spinOnce();
        rate.sleep();
    }

    // 任务主循环
    while (ros::ok()) {
        ROS_WARN("当前任务编号: %d", mission_num);
         ROS_INFO("障碍物距离 - 前(0°): %.2fm, 左(90°): %.2fm, 右(270°): %.2fm",
             distance_bins[0], distance_bins[90], distance_bins[270]);
        switch (mission_num) {
            // 任务1：起飞的悬停
            case 1:
                if (mission_pos_cruise(0, 0, ALTITUDE, 0, err_max)) {
                    mission_num = 2;  // 进入避障任务
                    last_request = ros::Time::now();
                } else if (ros::Time::now() - last_request >= ros::Duration(3.0)) {
                    mission_num = 2;  // 超时也进入下一个任务
                    last_request = ros::Time::now();
                }
                break;

            // 任务2：VFH+避障的前进（目标点3.0, 0.0）
            case 2:
                // 重要的修正：目标点定义为(东偏移, 北偏移)
                if (collision_avoidance_mission(3.9, 0.0, ALTITUDE, 0.0, err_max)) {
                    mission_num = 3;  // 进入降落任务
                    last_request = ros::Time::now();
                }
                break;
            // 任务2：VFH+避障的前进（目标点3.0, 0.0）
            case 3:
                // 重要的修正：目标点定义为(东偏移, 北偏移)
                if (mission_yaw_turn(-M_PI/2, 0.1)) {//#########向左旋转了90度#########（目标偏航角=90度=π/2弧度）北方向变成了正前方
                    mission_num = 4;  // 进入降落任务
                    last_request = ros::Time::now();
                }
                break;    // 任务2：VFH+避障的前进（目标点3.0, 0.0）
            case 4:
                // 重要的修正：目标点定义为(东偏移, 北偏移)
                if (collision_avoidance_mission(3.9, -5, ALTITUDE, -M_PI/2, err_max)) {
                    mission_num = 5;  // 进入降落任务
                    last_request = ros::Time::now();
                }
                break;
             case 5:
                // 重要的修正：目标点定义为(东偏移, 北偏移)
                if (mission_yaw_turn(M_PI, 0.1)) {//#########向左旋转了90度#########（目标偏航角=180度=π弧度）西方向变成了正前方
                    mission_num = 6;  // 进入降落任务
                    last_request = ros::Time::now();
                }
                break;
                 case 6:
                // 重要的修正：目标点定义为(东偏移, 北偏移)
                if (collision_avoidance_mission(0, -5, ALTITUDE, M_PI, err_max)) {
                    mission_num = 7;  // 进入降落任务
                    last_request = ros::Time::now();
                }
                break;
            case 7:
                // 重要的修正：目标点定义为(东偏移, 北偏移)
                if (mission_yaw_turn(-M_PI/2, 0.1)) {//#########向右旋转了135度#########（目标偏航角=1315度=7π/4弧度）东南方向变成了正前方
                    mission_num = 8;  // 进入降落任务
                    last_request = ros::Time::now();
                }
                break;
            // 任务2：VFH+避障的前进（目标点3.0, 0.0）
            case 8:
                // 重要的修正：目标点定义为(东偏移, 北偏移)
                if (collision_avoidance_mission(0, -6, ALTITUDE,-M_PI/2, err_max)) {
                    mission_num = 9;  // 进入降落任务
                    last_request = ros::Time::now();
                }
                break;
                 case 9:
                // 重要的修正：目标点定义为(东偏移, 北偏移)
                if (mission_yaw_turn(0, 0.1)) {//#########向右旋转了2*22.5度#########（目标偏航角=0度=2π弧度）正东方向变成了正前方
                    mission_num = 10;  // 进入降落任务
                    last_request = ros::Time::now();
                }
                break;    
                 case 10:
                // 重要的修正：目标点定义为(东偏移, 北偏移)
                if (collision_avoidance_mission(3.5, -6, ALTITUDE,0, err_max)) {
                    mission_num = 11;  // 进入降落任务
                    last_request = ros::Time::now();
                }
                break;
            // 任务3：精准的降落
            case 11:
                if (precision_land()) {
                    mission_num = -1;  // 任务的完成
                    ROS_INFO("VFH+避障任务完成，无人机已降落");
                }
                break;

                
        }

        mavros_setpoint_pos_pub.publish(setpoint_raw);
        ros::spinOnce();
        rate.sleep();
        
        if (mission_num == -1) break;  // 退出主循环
    }

    return 0;
}
