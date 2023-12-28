import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from '../utils/ApiError.js'
import {User} from '../models/user.model.js'
import {uploadOnCloudinaary} from '../utils/services/cloudinary.service.js'
import { ApiResponse } from "../utils/ApiResponse.js";
import JWT from "jsonwebtoken";

// access and refresh token genrate function
const generateAccessAndRefreshTokens =  async (userId)=>{
    try {
        const user = await User.findById(userId);
        const accessToken =  user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        // Assigning the refresh token to the user instance
        user.refreshToken = refreshToken;

        // Saving the user instance
        await user.save({validateBeforeSave: false}) 

        return {accessToken, refreshToken}

    } catch (error) {
        throw new ApiError(500, " something went wrong while generating access and refresh token")
    }
}

//register user 
const registerUser = asyncHandler(async(req, res)=>{
    // get user details from frontend
    // validation empty check
    //check if user already exists : username , email
    // check for images , check for avatar
    // upload them to cloudinary, check if avatar
    // create user object - create entry in db 
    // remove password and refresh token field from response
    //check for user creation 
    // retrun response,

    const {fullName, email, password,username} = req.body 
    // console.log("request body data part: ",req.body);

    // validation check field empty 
    
    if(
        [fullName, password,username,email].some((eachField)=> (eachField?.trim() ==="")
        ) 
    ) {
        throw new ApiError(400, "Every feilds are required")
    }

    // checking user already exists 


    const existedUser = await User.findOne({
        $or: [{username},{email}]
    })
    if(existedUser){
        throw new ApiError(409, "this user name or email already exist")
    }

    //TODO: update this code filhaal ke liye comment rahega but ise me uncomment karunga 

/*
    // username check
    const existedUsername = User.findOne({username}) 
    if(existedUsername){
        throw new ApiError(409, "This username already exists try different")
    }

    //email checking
    const existedEmail = User.findOne({email}) 
    if(existedEmail){
        throw new ApiError(409, "This email already registred!")
    }

    **/

    //TODO: password validation check 

    //  const avatarLocalFile = req.files?.avatar[0]?.path;

    //improved code
    let avatarLocalFile; // we receive proper path jo multer ne upload kiya hai wo hame mil jayega
    if(req.files && Array.isArray(req.files.avatar) && req.files.avatar[0]){
        avatarLocalFile = req.files.avatar[0].path;
    }else{
        // if avatat file not receive
        throw new ApiError(400, "Avatar file is required");
    }

    //    console.log("req files data: ",req.files)

    //  const coverImageLocalFile = req.files?.coverImage[0]?.path; 

    let coverImageLocalFile;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalFile = req.files.coverImage[0].path;
    }

//upload in cloudinary
const avatar = await uploadOnCloudinaary(avatarLocalFile);

const coverImage = await uploadOnCloudinaary(coverImageLocalFile);

if(!avatar){
    throw new ApiError(400, "Avatar file is required");

}

// store in database 
const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "", // hai to url lelo nahi diya hai user ne to empty hi rahne do
    email,
    password,
    username: username.toLowerCase()
})

// remove password and refresh token 
const userIsCreated = await User.findById(user._id).select(
    "-password -refreshToken"
)

if(!userIsCreated){
    throw new ApiError(500, "something went wrong registring the user")
}

// retern the response 
return res.status(201).json(
    new ApiResponse(200, userIsCreated, "user registered successfully!!")
);

}) 

// login user 
const loginUser = asyncHandler( async(req,res)=>{
     /** **********Stpes**********
      * req body data structure 
      * get data any one username or email
      * find the user and check user exists or not 
      * check the password if password not correct then send password not correct
      * access and refresh token generate  
      * send cookie
      * send responce successfull login
      */

     const {email , username, password} = req.body;

     if(!(username || email)){
        throw new ApiError(400, "username or email is required");
     }

     // find the user 
    const user = await User.findOne({
        $or: [{username},{email}] // in array we pass the object
    })

    //check the user exists or not 
    if(!user){
        throw new ApiError(404, "User does not exist")
    }

    //check the password
    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new ApiError(401, "Password is not correct");
    }

    // generating access and refresh token 
    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    //send in cookie
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    //return response 
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged in successfully!!"
        )
    )
   
})


// logout user 
const logoutUser = asyncHandler( async(req, res)=>{
/**  steps how to logout user
 * clear cookies so first i need user id access here 
 * creating and use middlewares to get access 
 */

    await User.findByIdAndUpdate(req.user._id,
        {
            $set: { refreshToken: undefined }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }
    const {accessToken, refreshToken} = req.user;
    
    return res
    .status(200)
    .clearCookie("accessToken", accessToken, options)
    .clearCookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {}, //data we send empty bez we dont need
            "User logout in successfully!!"
        )
    )


})

// refresh access token 
const refreshAccessToken = asyncHandler( async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken ;

    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request");
    }

    
    
    try {
        const decodedToken = JWT.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET, 
        )
        
        const user  = await User.findById(decodedToken?._id)
    
        if(!user){
            throw new ApiError(401, "Invalid Refresh Token")
        }
    
        // match token 
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh Token is expired or used")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
        // generating new refresh access token
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken,options)
        .json(
            new ApiResponse(
                200,
                {
                    accessToken, 
                    refreshToken: newRefreshToken,
                },
                "Access Token Refresh successfully !!"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})

//change password function
const changeCurrentPassword = asyncHandler( async(req, res)=>{
    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req.user?._id);
    // check provided oldPassword is correct or not 
   const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
   if(!isPasswordCorrect){
    throw new ApiError(400, "Invalid Password")
   }

   // set the password 
   user.password = newPassword;

   // save the password
   await user.save({validateBeforeSave: false})
   
   return res
   .status(200)
   .json(new ApiResponse(200,{},"Password Change Successfully!!"))
})

// get Current user 
const getCurrentUser = asyncHandler(async(req, res)=>{
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            req.user,
            "Current user fetched successfully !!"
        )
    )
})

// update Account details
const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName, email} = req.body;
    if(!fullName || !email){
        throw new ApiError(400, "All feilds are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName: fullName,
                email: email
            }
        },{new:true}).select("-password");
    
    return res
    .status(200)
    .json(new ApiResponse(
        200,{
            user
        },
        "Account Updated successfully !!"
    ))


    
})

// update user avatar 
const updateUserAvatar = asyncHandler(async(req, res)=>{
    const {avatarLocalPath}= req.file?.path;
    
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file missing")
    }

    //upload in cloudinary and get a url file so
    const avatar = await uploadOnCloudinaary(avatarLocalPath);

    // check avatar
    if(!avatar.url){
        throw new ApiError(400, "Error while uploading on avatar file in cloudinary")
    }

    
   const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true})
    
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "Avatar file updated successfully !!"
        )
    )
})

// update coverImage file
const updateUserCoverImage = asyncHandler(async(req, res)=>{
    const {coverImageLocalPath}= req.file?.path;
    
    if(!coverImageLocalPath){
        throw new ApiError(400, "coverImage file missing")
    }

    //upload in cloudinary and get a url file so
    const coverImage = await uploadOnCloudinaary(coverImageLocalPath);

    // check coverImage
    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading on coverImage file in cloudinary")
    }

    
   const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true})
    
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "coverImage file updated successfully !!"
        )
    )
})




export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
}