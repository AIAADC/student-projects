// #include <string>
// #include <ros/ros.h>
// #include <geometry_msgs/PoseStamped.h>
// #include <geometry_msgs/Point.h>
// #include <geometry_msgs/PointStamped.h>
// #include <geometry_msgs/Twist.h>
// #include <geometry_msgs/TwistStamped.h>
// #include <mavros_msgs/CommandBool.h>
// #include <mavros_msgs/SetMode.h>
// #include <mavros_msgs/State.h>
// #include <std_msgs/Bool.h>
// #include <mavros_msgs/PositionTarget.h>
// #include <cmath>
// #include <tf/transform_listener.h>
// #include <nav_msgs/Odometry.h>
// #include <mavros_msgs/CommandLong.h>
// #include <std_msgs/String.h>
// #include <std_msgs/Empty.h>
// #include <std_msgs/Int32.h>
// #include <livox_ros_driver/CustomMsg.h>

// using namespace std;//

// #define ALTITUDE 0.7f//

// mavros_msgs::PositionTarget setpoint_raw;//

// /************************************************************************
// 函数 1：无人机状态回调函数
// *************************************************************************/
// mavros_msgs::State current_state;//
// void state_cb(const mavros_msgs::State::ConstPtr &msg);//
// void state_cb(const mavros_msgs::State::ConstPtr &msg)//
// {//
// 	current_state = *msg;//
// }//

// /************************************************************************
// 函数 2：回调函数接收无人机的里程计信息
// 从里程计信息中提取无人机的位置信息和姿态信息
// *************************************************************************/
// tf::Quaternion quat;//
// nav_msgs::Odometry local_pos;//
// double roll, pitch, yaw;//
// float init_position_x_take_off = 0;//
// float init_position_y_take_off = 0;//
// float init_position_z_take_off = 0;//
// float init_yaw_take_off = 0;//
// bool flag_init_position = false;//
// void local_pos_cb(const nav_msgs::Odometry::ConstPtr &msg);//
// void local_pos_cb(const nav_msgs::Odometry::ConstPtr &msg)//
// {//
// 	local_pos = *msg;//
// 	tf::quaternionMsgToTF(local_pos.pose.pose.orientation, quat);//
// 	tf::Matrix3x3(quat).getRPY(roll, pitch, yaw);//
// 	if (flag_init_position == false && (local_pos.pose.pose.position.z != 0))//
// 	{//
// 		init_position_x_take_off = local_pos.pose.pose.position.x;//
// 		init_position_y_take_off = local_pos.pose.pose.position.y;//
// 		init_position_z_take_off = local_pos.pose.pose.position.z;//
// 		init_yaw_take_off = yaw;//
// 		flag_init_position = true;//
// 	}//
// }//


// /************************************************************************
// 函数 3: 无人机位置控制
// 控制无人机飞向（x, y, z）位置，target_yaw为目标航向角，error_max为允许的误差范围
// 进入函数后开始控制无人机飞向目标点，返回值为bool型，表示是否到达目标点
// *************************************************************************/
// float mission_pos_cruise_last_position_x = 0;
// float mission_pos_cruise_last_position_y = 0;
// bool mission_pos_cruise_flag = false;
// bool mission_pos_cruise(float x, float y, float z, float target_yaw, float error_max);
// bool mission_pos_cruise(float x, float y, float z, float target_yaw, float error_max)
// {
// 	if (mission_pos_cruise_flag == false)
// 	{
// 		mission_pos_cruise_last_position_x = local_pos.pose.pose.position.x;
// 		mission_pos_cruise_last_position_y = local_pos.pose.pose.position.y;
// 		mission_pos_cruise_flag = true;
// 	}
// 	setpoint_raw.type_mask = /*1 + 2 + 4 */ +8 + 16 + 32 + 64 + 128 + 256 + 512 /*+ 1024 */ + 2048;
// 	setpoint_raw.coordinate_frame = 1;
// 	setpoint_raw.position.x = x + init_position_x_take_off;
// 	setpoint_raw.position.y = y + init_position_y_take_off;
// 	setpoint_raw.position.z = z + init_position_z_take_off;
// 	setpoint_raw.yaw = target_yaw;
// 	ROS_INFO("now (%.2f,%.2f,%.2f,%.2f) to ( %.2f, %.2f, %.2f, %.2f)", local_pos.pose.pose.position.x ,local_pos.pose.pose.position.y, local_pos.pose.pose.position.z, target_yaw * 180.0 / M_PI, x + init_position_x_take_off, y + init_position_y_take_off, z + init_position_z_take_off, target_yaw * 180.0 / M_PI );
// 	if (fabs(local_pos.pose.pose.position.x - x - init_position_x_take_off) < error_max && fabs(local_pos.pose.pose.position.y - y - init_position_y_take_off) < error_max && fabs(local_pos.pose.pose.position.z - z - init_position_z_take_off) < error_max && fabs(yaw - target_yaw) < 0.1)
// 	{
// 		ROS_INFO("到达目标点，巡航点任务完成");
// 		mission_pos_cruise_flag = false;
// 		return true;
// 	}
// 	return false;
// }

// /************************************************************************
// 函数 4:降落
// 无人机当前位置作为降落点，缓慢下降至地面
// 返回值为bool型，表示是否降落完成
// *************************************************************************/
// float precision_land_init_position_x = 0;
// float precision_land_init_position_y = 0;
// bool precision_land_init_position_flag = false;
// ros::Time precision_land_last_time;
// bool precision_land();
// bool precision_land()
// {
// 	if (!precision_land_init_position_flag)
// 	{
// 		precision_land_init_position_x = local_pos.pose.pose.position.x;
// 		precision_land_init_position_y = local_pos.pose.pose.position.y;
//         precision_land_last_time = ros::Time::now();
// 		precision_land_init_position_flag = true;
// 	}
// 	setpoint_raw.position.x = precision_land_init_position_x;
// 	setpoint_raw.position.y = precision_land_init_position_y;
// 	setpoint_raw.position.z = -0.15;
// 	setpoint_raw.type_mask = /*1 + 2 + 4 + 8 + 16 + 32*/ +64 + 128 + 256 + 512 /*+ 1024 + 2048*/;
// 	setpoint_raw.coordinate_frame = 1;
//     if(ros::Time::now() - precision_land_last_time > ros::Duration(5.0))
//     {
//         ROS_INFO("Precision landing complete.");
//         precision_land_init_position_flag = false; // Reset for next landing
//         return true;
//     }
//     return false;
// }
// /************************************************************************
// 函数 5：cal_min_distance
// 计算激光雷达数据中的最小距离及其对应的角度索引
// 返回值：无
// *************************************************************************/
// float distance_c;
// int angle_c;

// double zero_plane_height = 0.0;           // 0度平面高度//
// double height_threshold = 0.05;           // 高度的阈值//
// double min_range = 0.1;                   // 最小检测距离//
// double max_range = 30.0;                  // 最大检测距离//
// int num_bins = 360;                       // 角度分bin数量//

// // 用于存储每个角度bin的最小距离
// std::vector<float> distance_bins;//
// std::vector<int> count_bins;//
// void cal_min_distance()
// {
//     distance_c = max_range;
//     angle_c = -1;
//     for (int i = 0; i <= 359; i++)
//     {
//         if(distance_bins[i] < distance_c)
//         {
//             distance_c = distance_bins[i];
//             angle_c = i;
//         }
//     }
//     ROS_WARN("Minimum Distance: %.2f m at Angle: %d deg", distance_c, angle_c);
// }

// /************************************************************************
// 函数 6:lidar_cb
// 点云回调函数，处理Livox雷达的点云数据，实现360度障碍物检测
// /livox/lidar example:

// *************************************************************************/

// void livox_custom_cb(const livox_ros_driver::CustomMsg::ConstPtr& livox_msg) {
//     // 初始化bins
//     // ROS_INFO("Received Livox point cloud with %d points", livox_msg->point_num);
//         static bool first_call = true;
    
//     distance_bins.assign(num_bins, max_range);
//     count_bins.assign(num_bins, 0);
    
//     int total_points = livox_msg->point_num;
//     int plane_points = 0;
//     if (first_call) {
//         first_call = false;
//         ROS_INFO("=== Livox点云坐标系测试 ===");
//         for (int i = 0; i <total_points && i < livox_msg->point_num; i++) {
//             ROS_INFO("点[%d]: x=%.3f, y=%.3f, z=%.3f", 
//                      i, 
//                      livox_msg->points[i].x,
//                      livox_msg->points[i].y,
//                      livox_msg->points[i].z);
//         }
//     }
//     // 遍历Livox自定义消息中的点
//     for (int i = 0; i < total_points; i++) {
//         const livox_ros_driver::CustomPoint& point = livox_msg->points[i];
        
//         float x = point.x;
//         float y = point.y;
//         float z = point.z;
        
//         // 筛选0度平面附近的点
//         if (fabs(z - zero_plane_height ) > height_threshold) {
//             continue;
//         }
        
//         plane_points++;
        
//         // 计算距离和角度
//         float distance = sqrt(x * x + y * y);
//         float angle = atan2(y, x);  // 弧度
        
//         // 转换为角度并映射到0-359
//         int angle_bin = static_cast<int>((angle * 180.0 / M_PI));
        
//         // 转换为0-359范围
//         if (angle_bin < 0) angle_bin += 360;
//         if (angle_bin >= 360) angle_bin -= 360;
        
//         // 确保在有效范围内
//         if (angle_bin >= 0 && angle_bin < num_bins) {
//             // 只保留每个角度bin的最小距离
//             if (distance >= min_range && distance <= max_range && 
//                 !std::isinf(distance) && !std::isnan(distance)) {
//                 if (distance < distance_bins[angle_bin]) {
//                     distance_bins[angle_bin] = distance;
//                 }
//                 count_bins[angle_bin]++;
//             }
//         }
//     }
//     for(int i = 0; i < num_bins; i++) {
//         if(count_bins[i] == 0) {
//             distance_bins[i] = max_range; // 如果该bin没有点，则设为最大距离
//         }
//         // ROS_INFO("Angle Bin %d: Min Distance = %.2f m, Point Count = %d", i, distance_bins[i], count_bins[i]);
//     }
//     cal_min_distance();
// }

// /************************************************************************
// 函数 7: satfunc
// 数据饱和函数，限制数据在±Max范围内
// *************************************************************************/
// float satfunc(float data, float Max)//
// {//
//     if(abs(data)>Max) return ( data > 0 ) ? Max : -Max;//
//     else return data;//
// }//

// /************************************************************************
// 函数 8: collision_avoidance 避障函数
// 根据激光雷达数据计算避障速度，并与追踪速度叠加，得到最终速度指令
// 输入参数：目标位置target_x, target_y
// 返回值：true/false表示是否到达目标点
// *************************************************************************/
// float R_outside,R_inside; //                                      //安全半径 [避障算法相关参数]
// float p_R;                  //                                    //大圈比例参数
// float p_r;                    //                                  //小圈比例参数
// float distance_cx,distance_cy;                                  //最近障碍物距离XY
// float vel_collision[2];                                         //躲避障碍部分速度
// float vel_collision_max;        //                                //躲避障碍部分速度限幅
// float p_xy;                                                     //追踪部分位置环P
// float vel_track[2];                                             //追踪部分速度
// float vel_track_max;              //                              //追踪部分速度限幅

// float vel_sp_body[2];                                           //总速度
// float vel_sp_ENU[2];                                            //ENU下的总速度
// float vel_sp_max;                   //                            //总速度限幅
// std_msgs::Bool flag_collision_avoidance;                       //是否进入避障模式标志位

// void rotation_yaw(float yaw_angle, float input[2], float output[2])//
// {//
//     output[0] = input[0] * cos(yaw_angle) - input[1] * sin(yaw_angle);//
//     output[1] = input[0] * sin(yaw_angle) + input[1] * cos(yaw_angle);//
// }//

// bool collision_avoidance_mission(float target_x,float target_y,float target_z,float target_yaw,float err_max)
// {
//     //2. 根据最小距离判断：是否启用避障策略
//     if (distance_c >= R_outside )
//     {
//         flag_collision_avoidance.data = false;
//     }
//     else
//     {
//         flag_collision_avoidance.data = true;
//     }

//     //3. 计算追踪速度
//     vel_track[0] = p_xy * (target_x - local_pos.pose.pose.position.x);
//     vel_track[1] = p_xy * (target_y - local_pos.pose.pose.position.y);

//     //速度限幅
//     for (int i = 0; i < 2; i++)
//     {
//         vel_track[i] = satfunc(vel_track[i],vel_track_max);
//     }
//     vel_collision[0]= 0;
//     vel_collision[1]= 0;
//     ROS_WARN("Velocity Command Body before CA: vx: %.2f , vy: %.2f ", vel_track[0], vel_track[1]);

//     //4. 避障策略
//     if(flag_collision_avoidance.data == true)
//     {
//         distance_cx = distance_c * cos(((float)angle_c)/180*3.1415926);
//         distance_cy = distance_c * sin(((float)angle_c)/180*3.1415926);
//         ROS_WARN("Angle_c: %d deg ", angle_c);
//         ROS_WARN("angle_c/180*3.1415926: %.2f rad ", angle_c/180*3.1415926);
//         ROS_WARN("cos(angle_c/180*3.1415926): %.2f  ", cos(angle_c/180*3.1415926));
//         ROS_WARN("Distance_cx: %.2f , Distance_cy: %.2f ", distance_cx, distance_cy);

//         float F_c;

//         F_c = 0;

//         if(distance_c > R_outside)
//         {
//             //对速度不做限制
//             vel_collision[0] = vel_collision[0] + 0;
//             vel_collision[1] = vel_collision[1] + 0;
//             cout << " Forward Outside "<<endl;
//         }

//         //小幅度抑制移动速度
//         if(distance_c > R_inside && distance_c <= R_outside)
//         {
//             F_c = p_R * (R_outside - distance_c);

//         }

//         //大幅度抑制移动速度
//         if(distance_c <= R_inside )
//         {
//             F_c = p_R * (R_outside - R_inside) + p_r * (R_inside - distance_c);
//         }
//         ROS_WARN("Force F_c: %.2f ", F_c);

//         if(distance_cx > 0)
//         {
//             vel_collision[0] = vel_collision[0] - F_c * distance_cx /distance_c;
//         }else{
//             vel_collision[0] = vel_collision[0] - F_c * distance_cx /distance_c;
//         }

//         if(distance_cy > 0)
//         {
//             vel_collision[1] = vel_collision[1] - F_c * distance_cy / distance_c;
//         }else{
//             vel_collision[1] = vel_collision[1] - F_c * distance_cy /distance_c;
//         }
//         //避障速度限幅
//         for (int i = 0; i < 2; i++)
//         {
//             vel_collision[i] = satfunc(vel_collision[i],vel_collision_max);
//         }
//     }

//     vel_sp_body[0] = vel_track[0] + vel_collision[0];
//     vel_sp_body[1] = vel_track[1] + vel_collision[1]; //dyx

//     ROS_WARN("Velocity Command Body Track: vx: %.2f , vy: %.2f ", vel_track[0], vel_track[1]);
//     ROS_WARN("Velocity Command Body Collision: vx: %.2f , vy: %.2f ", vel_collision[0], vel_collision[1]);
//     ROS_WARN("Velocity Command Body after CA: vx: %.2f , vy: %.2f ", vel_sp_body[0], vel_sp_body[1]);

//     //找当前位置到目标点的xy差值，如果出现其中一个差值小，另一个差值大，
//     //且过了一会还是保持这个差值就开始从差值入手。
//     //比如，y方向接近0，但x还差很多，但x方向有障碍，这个时候按discx cy的大小，缓解y的难题。

//     for (int i = 0; i < 2; i++)
//     {
//         vel_sp_body[i] = satfunc(vel_sp_body[i],vel_sp_max);
//     }
//     rotation_yaw(yaw,vel_sp_body,vel_sp_ENU);
//     setpoint_raw.type_mask = 1 + 2 /* + 4  +8 + 16 + 32 */+ 64 + 128 + 256 + 512 /*+ 1024 */ + 2048;
// 	setpoint_raw.coordinate_frame = 1;
// 	setpoint_raw.velocity.x = vel_sp_ENU[0];
// 	setpoint_raw.velocity.y = vel_sp_ENU[1];
// 	setpoint_raw.position.z = target_z + init_position_z_take_off;
// 	setpoint_raw.yaw = target_yaw;

//     ROS_WARN("Velocity Command ENU: vx: %.2f , vy: %.2f ", vel_sp_ENU[0], vel_sp_ENU[1]);
//     ROS_WARN("Target Pos: ( %.2f, %.2f, %.2f )", target_x + init_position_x_take_off, target_y + init_position_y_take_off, target_z + init_position_z_take_off);
//     ROS_WARN("Current Pos: ( %.2f, %.2f, %.2f )", local_pos.pose.pose.position.x ,local_pos.pose.pose.position.y, local_pos.pose.pose.position.z );

//     if(fabs(local_pos.pose.pose.position.x - target_x - init_position_x_take_off) < err_max && fabs(local_pos.pose.pose.position.y - target_y - init_position_y_take_off) < err_max && fabs(local_pos.pose.pose.position.z - target_z - init_position_z_take_off) < err_max && fabs(yaw - target_yaw) < 0.1)
//     {
//         return true;
//     }
//     return false;

// }